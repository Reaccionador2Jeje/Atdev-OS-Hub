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

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function isSafeText(value: unknown, max: number) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
function validHttps(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}
function validSlug(value: unknown) {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("Usa POST.", 405);
  try {
    const rawToken = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!rawToken.startsWith("atdev_os_hub_") || rawToken.length < 40) return fail("Token Atdev OS Hub inválido.", 401);
    const tokenHash = await sha256(rawToken);
    const { data: token, error: tokenError } = await admin.from("os_hub_api_tokens")
      .select("id,owner_id,scopes,expires_at,revoked_at")
      .eq("token_hash", tokenHash).maybeSingle();
    if (tokenError || !token || token.revoked_at || (token.expires_at && new Date(token.expires_at).getTime() <= Date.now())) {
      return fail("Token inválido, revocado o vencido.", 401);
    }
    const body = await req.json();
    const action = String(body.action ?? "");
    if (action === "publish_project") {
      if (!token.scopes.includes("os:publish")) return fail("El token no tiene el permiso os:publish.", 403);
      const project = body.project ?? {};
      const externalId = String(project.id ?? "").trim();
      const name = String(project.name ?? "").trim();
      const slug = String(project.slug ?? "").trim().toLowerCase();
      const summary = String(project.summary ?? "").trim();
      if (!isSafeText(externalId, 120) || !isSafeText(name, 80) || !validSlug(slug) || summary.length < 5 || summary.length > 180) {
        return fail("El manifiesto necesita ID, nombre, slug válido y resumen de 5 a 180 caracteres.");
      }
      const sourceUrl = project.sourceUrl ? String(project.sourceUrl) : null;
      if (sourceUrl && !validHttps(sourceUrl)) return fail("El repositorio debe usar HTTPS.");
      const allowedDesktops = ["gnome","kde-plasma","xfce","lxqt","cinnamon","mate","none"];
      const desktops = Array.isArray(project.desktopEnvironments)
        ? project.desktopEnvironments.filter((x: unknown) => allowedDesktops.includes(String(x))).slice(0, 8)
        : [];
      const architectures = Array.isArray(project.architectures)
        ? project.architectures.filter((x: unknown) => ["x86_64","amd64","aarch64","arm64","i386"].includes(String(x))).slice(0, 8)
        : ["x86_64"];
      const payload = {
        name, slug, summary,
        description: String(project.description ?? "").slice(0, 10000),
        base_distribution: String(project.baseDistribution ?? "other").slice(0, 40),
        base_release: String(project.baseRelease ?? "").slice(0, 80),
        desktop_environments: desktops,
        architectures: architectures.length ? architectures : ["x86_64"],
        source_url: sourceUrl,
        visibility: "public",
        status: "published",
      };
      const { data: existing, error: lookupError } = await admin.from("os_projects").select("id")
        .eq("owner_id", token.owner_id).eq("slug", slug).maybeSingle();
      if (lookupError) throw lookupError;
      let projectId = existing?.id;
      if (projectId) {
        const { error } = await admin.from("os_projects").update(payload)
          .eq("id", projectId).eq("owner_id", token.owner_id);
        if (error) throw error;
      } else {
        const { data, error } = await admin.from("os_projects").insert({
          ...payload, owner_id: token.owner_id, license: String(project.license ?? "NOASSERTION").slice(0, 80),
        }).select("id").single();
        if (error || !data) throw error ?? new Error("No se pudo crear el proyecto.");
        projectId = data.id;
      }
      const externalVersion = String(project.version ?? "0.1.0").slice(0, 64);
      const { error: integrationError } = await admin.from("os_project_integrations").upsert({
        project_id: projectId, owner_id: token.owner_id, integration: "void_memingo",
        external_project_id: externalId, external_project_version: externalVersion,
        sync_enabled: true, last_synced_at: new Date().toISOString(),
        last_sync_status: "succeeded", last_sync_message: "Manifiesto sincronizado desde Void Memingo.",
      }, { onConflict: "owner_id,integration,external_project_id" });
      if (integrationError) throw integrationError;
      await admin.from("os_hub_api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", token.id);
      return json({ ok: true, project_id: projectId, slug, external_project_id: externalId });
    }

    if (action === "build_event") {
      if (!token.scopes.includes("build:submit")) return fail("El token no tiene el permiso build:submit.", 403);
      const externalId = String(body.external_project_id ?? "");
      const version = String(body.version ?? "");
      const status = String(body.status ?? "");
      const allowedStatus = ["queued","building","succeeded","failed","cancelled"];
      if (!isSafeText(externalId, 120) || !isSafeText(version, 64) || !allowedStatus.includes(status)) {
        return fail("Evento de compilación inválido.");
      }
      const { data: integration, error: integrationError } = await admin.from("os_project_integrations")
        .select("id,project_id").eq("owner_id", token.owner_id)
        .eq("integration", "void_memingo").eq("external_project_id", externalId).maybeSingle();
      if (integrationError || !integration) return fail("Primero publica el manifiesto del proyecto desde Void Memingo.", 404);
      const artifactUrl = body.artifact_url ? String(body.artifact_url) : null;
      const checksum = body.sha256 ? String(body.sha256).toLowerCase() : null;
      if (artifactUrl && !validHttps(artifactUrl)) return fail("El artefacto debe usar HTTPS.");
      if (checksum && !/^[a-f0-9]{64}$/.test(checksum)) return fail("SHA-256 inválido.");
      const sourceCommit = body.source_commit ? String(body.source_commit).slice(0, 80) : null;
      const inputMetadata = typeof body.metadata === "object" && body.metadata ? body.metadata : {};
      const allowedMetadata = ["builder_version","base_distribution","architecture","desktop_environment","iso_label","target_filesystem","build_profile"];
      const safeMetadata: Record<string, string | number | boolean> = {};
      for (const key of allowedMetadata) {
        const value = inputMetadata[key];
        if (typeof value === "string" && value.length <= 160) safeMetadata[key] = value;
        else if (typeof value === "number" || typeof value === "boolean") safeMetadata[key] = value;
      }
      const { error: buildError } = await admin.from("os_builds").insert({
        project_id: integration.project_id, owner_id: token.owner_id, integration_id: integration.id,
        version, source_commit: sourceCommit, build_system: "void-memingo",
        build_status: status, artifact_url: artifactUrl, sha256: checksum,
        build_metadata: safeMetadata,
        started_at: body.started_at ?? null, finished_at: body.finished_at ?? null,
      });
      if (buildError) throw buildError;
      const { error: updateError } = await admin.from("os_project_integrations").update({
        external_project_version: version, last_synced_at: new Date().toISOString(),
        last_sync_status: status === "failed" ? "failed" : "succeeded",
        last_sync_message: `Última compilación: ${status}.`,
      }).eq("id", integration.id).eq("owner_id", token.owner_id);
      if (updateError) throw updateError;
      // Build artifacts are recorded as provenance. Release publication remains
      // a separate explicit action in OS Hub; a client-supplied checksum is not
      // treated as server-side artifact verification.
      await admin.from("os_hub_api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", token.id);
      return json({ ok: true, build_status: status, project_id: integration.project_id });
    }
    return fail("Acción desconocida.");
  } catch (error) {
    console.error("Void Memingo sync failed:", error);
    return fail(error instanceof Error ? error.message.slice(0, 300) : "Error interno.", 500);
  }
});
