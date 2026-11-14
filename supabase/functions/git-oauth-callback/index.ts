import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const serviceKey = secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const allowedOrigins = (Deno.env.get("APP_ALLOWED_ORIGINS") ?? "http://127.0.0.1:4173,http://localhost:4173").split(",").map(x => x.trim());

async function exchange(provider: string, code: string, callback: string, verifier?: string | null) {
  const clientId = Deno.env.get(provider === "github" ? "GITHUB_APP_CLIENT_ID" : "GITLAB_CLIENT_ID")!;
  const clientSecret = Deno.env.get(provider === "github" ? "GITHUB_APP_CLIENT_SECRET" : "GITLAB_CLIENT_SECRET")!;
  const form = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: callback });
  if (provider === "gitlab") form.set("grant_type", "authorization_code");
  if (verifier) form.set("code_verifier", verifier);
  const response = await fetch(provider === "github" ? "https://github.com/login/oauth/access_token" : "https://gitlab.com/oauth/token", {
    method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: form,
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(data.error_description ?? data.error ?? "No se pudo intercambiar el código OAuth.");
  return data;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  let returnOrigin = allowedOrigins[0];
  const finish = (status: string, message: string) => {
    const target = new URL("/", returnOrigin);
    target.searchParams.set("git_connection", status);
    target.searchParams.set("provider_message", message.slice(0, 160));
    return Response.redirect(target.toString(), 303);
  };
  try {
    const state = url.searchParams.get("state") ?? "";
    if (!state) throw new Error("Falta el estado OAuth.");
    const { data: states, error: stateError } = await admin.rpc("git_consume_oauth_state", { p_state_id: state });
    if (stateError || !states?.[0]) throw new Error("El estado OAuth expiró o ya fue utilizado. Inicia la conexión otra vez.");
    const stateRecord = states[0];
    returnOrigin = stateRecord.return_origin;
    if (!allowedOrigins.includes(returnOrigin)) throw new Error("Origen OAuth no permitido.");
    const provider = stateRecord.provider;
    const code = url.searchParams.get("code");
    if (!code) return finish("error", url.searchParams.get("error_description") ?? "Autorización cancelada.");
    if (provider !== "github" && provider !== "gitlab") throw new Error("Proveedor inválido.");

    const callback = `${supabaseUrl}/functions/v1/git-oauth-callback`;
    const token = await exchange(provider, code, callback, stateRecord.code_verifier);
    const profileResponse = await fetch(provider === "github" ? "https://api.github.com/user" : "https://gitlab.com/api/v4/user", {
      headers: provider === "github"
        ? { Authorization: `Bearer ${token.access_token}`, Accept: "application/vnd.github+json" }
        : { Authorization: `Bearer ${token.access_token}` },
    });
    const profile = await profileResponse.json();
    if (!profileResponse.ok || !profile.id) throw new Error("No se pudo verificar la cuenta del proveedor.");
    const providerUsername = provider === "github" ? profile.login : profile.username;
    const { data: existing } = await admin.from("git_provider_connections").select("id")
      .eq("owner_id", stateRecord.owner_id).eq("provider", provider)
      .eq("provider_user_id", String(profile.id)).maybeSingle();
    let connectionId = existing?.id;
    if (connectionId) {
      const { error } = await admin.from("git_provider_connections").update({
        provider_username: providerUsername,
        scopes: (token.scope ?? "").split(/[ ,]+/).filter(Boolean),
        write_access: stateRecord.write_access === true,
        status: "connected", last_verified_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", connectionId).eq("owner_id", stateRecord.owner_id);
      if (error) throw error;
    } else {
      const { data, error } = await admin.from("git_provider_connections").insert({
        owner_id: stateRecord.owner_id, provider, provider_user_id: String(profile.id),
        provider_username: providerUsername,
        instance_url: provider === "github" ? "https://github.com" : "https://gitlab.com",
        scopes: (token.scope ?? "").split(/[ ,]+/).filter(Boolean),
        write_access: stateRecord.write_access === true,
        status: "connected", last_verified_at: new Date().toISOString(),
      }).select("id").single();
      if (error || !data) throw error ?? new Error("No se pudo guardar la conexión.");
      connectionId = data.id;
    }
    const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
    const { error: vaultError } = await admin.rpc("git_store_provider_credential", {
      p_connection_id: connectionId, p_access_token: token.access_token,
      p_refresh_token: token.refresh_token ?? null, p_expires_at: expiresAt,
    });
    if (vaultError) throw vaultError;
    return finish("connected", `Cuenta ${providerUsername} conectada correctamente.`);
  } catch (error) {
    console.error("Git OAuth callback failed:", error);
    return finish("error", error instanceof Error ? error.message : "Error OAuth.");
  }
});
