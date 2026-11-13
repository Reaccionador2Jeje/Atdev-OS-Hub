import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const serviceKey = secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const fail = (message: string, status = 400) => json({ error: message }, status);
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("Usa POST.", 405);
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) return fail("Debes iniciar sesión.", 401);
  const { data: authData, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !authData.user) return fail("Sesión no válida.", 401);
  const ownerId = authData.user.id;
  try {
    const body = await req.json();
    if (body.action === "list") {
      const { data, error } = await admin.from("os_hub_api_tokens")
        .select("id,label,token_prefix,scopes,expires_at,last_used_at,revoked_at,created_at")
        .eq("owner_id", ownerId).order("created_at", { ascending: false });
      if (error) throw error;
      return json({ tokens: data ?? [] });
    }
    if (body.action === "create") {
      const label = String(body.label ?? "").trim();
      if (label.length < 2 || label.length > 80) return fail("El nombre del token debe tener entre 2 y 80 caracteres.");
      const random = crypto.getRandomValues(new Uint8Array(32));
      const encoded = btoa(String.fromCharCode(...random)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
      const rawToken = "atdev_os_hub_" + encoded;
      const { error } = await admin.from("os_hub_api_tokens").insert({
        owner_id: ownerId, label, token_prefix: rawToken.slice(0, 24),
        token_hash: await sha256(rawToken), scopes: ["os:publish", "build:submit"],
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (error) throw error;
      return json({ token: rawToken, expires_in_days: 365 });
    }
    if (body.action === "revoke") {
      const id = String(body.token_id ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("Identificador de token inválido.");
      const { data, error } = await admin.from("os_hub_api_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id).eq("owner_id", ownerId).is("revoked_at", null)
        .select("id").maybeSingle();
      if (error) throw error;
      if (!data) return fail("Token no encontrado o ya revocado.", 404);
      return json({ revoked: true });
    }
    return fail("Acción desconocida.");
  } catch (error) {
    console.error("OS Hub token manager failed:", error);
    return fail(error instanceof Error ? error.message.slice(0, 300) : "Error interno.", 500);
  }
});
