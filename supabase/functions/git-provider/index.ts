import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const serviceKey = secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const fail = (message: string, status = 400) => json({ error: message }, status);

async function authenticatedUser(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}
function providerBase(provider: string) {
  if (provider === "github") return "https://api.github.com";
  if (provider === "gitlab") return "https://gitlab.com/api/v4";
  throw new Error(`El proveedor "${provider}" todavía no tiene un adaptador API.`);
}
function headersFor(provider: string, token: string) {
  if (provider === "github") {
    return { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10" };
  }
  if (provider === "gitlab") return { Authorization: `Bearer ${token}` };
  throw new Error(`El proveedor "${provider}" todavía no tiene un adaptador API.`);
}
async function providerFetch(provider: string, token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(providerBase(provider) + path, {
    ...init,
    headers: { ...headersFor(provider, token), ...(init.headers as Record<string, string> ?? {}) },
  });
  const body = await response.text();
  let data: any = null;
  try { data = body ? JSON.parse(body) : null; } catch { data = body; }
  if (!response.ok) {
    const message = typeof data?.message === "string" ? data.message
      : typeof data?.error_description === "string" ? data.error_description
      : typeof data?.error === "string" ? data.error : `Provider API returned ${response.status}`;
    throw new Error(message);
  }
  return data;
}
async function providerFetchMaybe404(provider: string, token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(providerBase(provider) + path, {
    ...init,
    headers: { ...headersFor(provider, token), ...(init.headers as Record<string, string> ?? {}) },
  });
  if (response.status === 404) return null;
  const body = await response.text();
  let data: any = null;
  try { data = body ? JSON.parse(body) : null; } catch { data = body; }
  if (!response.ok) {
    const message = typeof data?.message === "string" ? data.message
      : typeof data?.error_description === "string" ? data.error_description
      : typeof data?.error === "string" ? data.error : `Provider API returned ${response.status}`;
    throw new Error(message);
  }
  return data;
}
function requireWriteScope(connection: any) {
  const scopes = Array.isArray(connection.scopes) ? connection.scopes : [];
  if (connection.write_access !== true) {
    throw new Error("Esta conexión no tiene consentimiento de escritura. Reconecta el proveedor y activa la opción de escritura.");
  }
  if (connection.provider === "gitlab" && !scopes.includes("api")) {
    throw new Error("GitLab no concedió el scope api. Reconecta y autoriza el acceso de escritura.");
  }
  if (connection.provider !== "github" && connection.provider !== "gitlab") {
    throw new Error("Este proveedor no admite operaciones de escritura.");
  }
  // GitHub App user tokens intentionally return an empty OAuth scope.
  // GitHub enforces the app's Contents/Pull requests permissions on every API request.
}

function decodeBase64Utf8(value: string) {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

async function loadCredential(connectionId: string, userId: string) {
  const { data: connection, error: connectionError } = await admin
    .from("git_provider_connections").select("*").eq("id", connectionId)
    .eq("owner_id", userId).maybeSingle();
  if (connectionError || !connection || connection.status !== "connected") throw new Error("Conexión Git no encontrada o desconectada.");
  if (connection.provider !== "github" && connection.provider !== "gitlab") {
    throw new Error(`El adaptador API de ${connection.provider} todavía no está disponible. GitVoid sigue en fase experimental.`);
  }
  const { data, error } = await admin.rpc("git_get_provider_credential", { p_connection_id: connectionId });
  if (error || !data?.[0]?.access_token) throw new Error("No se encontró la credencial segura. Vuelve a conectar el proveedor.");
  let access = data[0].access_token as string;
  let refresh = data[0].refresh_token as string | null;
  let expiresAt = data[0].expires_at as string | null;
  if (expiresAt && new Date(expiresAt).getTime() < Date.now() + 120_000 && refresh) {
    const clientId = Deno.env.get(connection.provider === "github" ? "GITHUB_APP_CLIENT_ID" : "GITLAB_CLIENT_ID");
    const clientSecret = Deno.env.get(connection.provider === "github" ? "GITHUB_APP_CLIENT_SECRET" : "GITLAB_CLIENT_SECRET");
    if (clientId && clientSecret) {
      const form = new URLSearchParams({
        client_id: clientId, client_secret: clientSecret,
        grant_type: "refresh_token", refresh_token: refresh,
      });
      const tokenResponse = await fetch(connection.provider === "github"
        ? "https://github.com/login/oauth/access_token" : "https://gitlab.com/oauth/token", {
          method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: form,
        });
      const refreshed = await tokenResponse.json();
      if (tokenResponse.ok && refreshed.access_token) {
        access = refreshed.access_token;
        refresh = refreshed.refresh_token ?? refresh;
        expiresAt = refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : null;
        await admin.rpc("git_store_provider_credential", {
          p_connection_id: connectionId, p_access_token: access,
          p_refresh_token: refresh, p_expires_at: expiresAt,
        });
      }
    }
  }
  return { connection, access };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("Usa POST.", 405);
  const user = await authenticatedUser(req);
  if (!user) return fail("Debes iniciar sesión en Atdev OS Hub.", 401);
  try {
    const body = await req.json();
    const action = String(body.action ?? "");
    if (action === "connect_url") {
      const provider = String(body.provider ?? "");
      if (provider !== "github" && provider !== "gitlab") return fail("Proveedor no compatible.");
      const clientId = Deno.env.get(provider === "github" ? "GITHUB_APP_CLIENT_ID" : "GITLAB_CLIENT_ID");
      if (!clientId) return fail(`Falta configurar ${provider === "github" ? "GITHUB_APP_CLIENT_ID" : "GITLAB_CLIENT_ID"} en Supabase Edge Function Secrets.`, 503);
      const origin = String(body.origin ?? "");
      const allowed = (Deno.env.get("APP_ALLOWED_ORIGINS") ?? "http://127.0.0.1:4173,http://localhost:4173").split(",").map(x => x.trim());
      if (!allowed.includes(origin)) return fail("El origen de retorno no está permitido.", 403);
      const callback = `${supabaseUrl}/functions/v1/git-oauth-callback`;
      const params = new URLSearchParams({ client_id: clientId, redirect_uri: callback, response_type: "code" });
      let verifier: string | null = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(48)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
      const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
      params.set("code_challenge", challenge);
      params.set("code_challenge_method", "S256");
      const writeAccess = body.write_access === true;
      if (provider === "github") params.set("scope", "offline_access");
      else params.set("scope", writeAccess ? "api" : "read_user read_api read_repository");
      const stateBytes = crypto.getRandomValues(new Uint8Array(32));
      const state = btoa(String.fromCharCode(...stateBytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
      const { error: stateError } = await admin.rpc("git_create_oauth_state", {
        p_state_id: state, p_owner_id: user.id, p_provider: provider,
        p_return_origin: origin, p_code_verifier: verifier, p_write_access: writeAccess,
      });
      if (stateError) throw stateError;
      params.set("state", state);
      const authorizationUrl = provider === "github"
        ? "https://github.com/login/oauth/authorize?" + params.toString()
        : "https://gitlab.com/oauth/authorize?" + params.toString();
      return json({ authorization_url: authorizationUrl });
    }

    if (action === "disconnect_connection") {
      const connectionId = String(body.connection_id ?? "");
      if (!connectionId) return fail("Falta el identificador de la conexión.");
      const { data: connection, error: connectionError } = await admin
        .from("git_provider_connections")
        .select("id")
        .eq("id", connectionId)
        .eq("owner_id", user.id)
        .maybeSingle();
      if (connectionError || !connection) return fail("Conexión Git no encontrada.", 404);
      const { error: credentialError } = await admin.rpc("git_delete_provider_credential", {
        p_connection_id: connectionId,
      });
      if (credentialError) throw credentialError;
      const { error: deleteError } = await admin.from("git_provider_connections")
        .delete().eq("id", connectionId).eq("owner_id", user.id);
      if (deleteError) throw deleteError;
      return json({ disconnected: true });
    }

    if (action === "list_connections") {
      const { data, error } = await admin.from("git_provider_connections")
        .select("id,provider,provider_username,instance_url,scopes,write_access,status,connected_at,last_verified_at")
        .eq("owner_id", user.id).order("connected_at", { ascending: false });
      if (error) throw error;
      return json({ connections: data ?? [] });
    }

    if (action === "sync_repositories") {
      const { connection, access } = await loadCredential(String(body.connection_id ?? ""), user.id);
      const provider = connection.provider;
      let repos: any[];
      if (provider === "github") {
        repos = await providerFetch(provider, access, "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member");
      } else {
        repos = await providerFetch(provider, access, "/projects?membership=true&per_page=100&order_by=last_activity_at");
      }
      const records = repos.map((repo: any) => ({
        connection_id: connection.id, owner_id: user.id, provider,
        external_repo_id: String(repo.id),
        full_name: provider === "github" ? repo.full_name : repo.path_with_namespace,
        description: repo.description ?? "",
        clone_url: provider === "github" ? repo.clone_url : repo.http_url_to_repo,
        web_url: provider === "github" ? repo.html_url : repo.web_url,
        default_branch: repo.default_branch ?? "main",
        visibility: provider === "github" ? (repo.private ? "private" : "public") : (repo.visibility ?? "private"),
        permissions: provider === "github" ? (repo.permissions ?? {}) : { access_level: repo.permissions?.project_access?.access_level ?? repo.permissions?.group_access?.access_level ?? null },
        last_synced_at: new Date().toISOString(),
      }));
      if (records.length) {
        const { error } = await admin.from("git_repositories").upsert(records, { onConflict: "connection_id,external_repo_id" });
        if (error) throw error;
      }
      return json({ imported: records.length });
    }

    if (action === "list_repositories") {
      const { data, error } = await admin.from("git_repositories")
        .select("id,provider,full_name,description,web_url,default_branch,visibility,permissions,last_synced_at,connection_id")
        .eq("owner_id", user.id).order("full_name");
      if (error) throw error;
      return json({ repositories: data ?? [] });
    }

    if (action === "list_branches" || action === "list_commits" || action === "list_tree" ||
        action === "get_file" || action === "create_branch" || action === "commit_file" || action === "create_review_request") {
      const { data: repo, error } = await admin.from("git_repositories").select("*")
        .eq("id", String(body.repository_id ?? "")).eq("owner_id", user.id).maybeSingle();
      if (error || !repo) return fail("Repositorio no encontrado.", 404);
      const { connection, access } = await loadCredential(repo.connection_id, user.id);
      const provider = connection.provider;
      if (provider === "github") {
        const [owner, name] = repo.full_name.split("/");
        if (!owner || !name) return fail("Identificador de repositorio inválido.");
        const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
        if (action === "list_branches") return json({ items: await providerFetch(provider, access, base + "/branches?per_page=100") });
        if (action === "list_commits") return json({ items: await providerFetch(provider, access, base + "/commits?sha=" + encodeURIComponent(String(body.branch ?? repo.default_branch)) + "&per_page=30") });
        if (action === "list_tree") {
          const branch = String(body.branch ?? repo.default_branch);
          const ref = await providerFetch(provider, access, base + "/git/ref/heads/" + encodeURIComponent(branch));
          return json({ items: await providerFetch(provider, access, base + "/git/trees/" + encodeURIComponent(ref.object.sha) + "?recursive=1") });
        }
        if (action === "get_file") {
          const path = String(body.path ?? "").replace(/^\/+/, "");
          const branch = String(body.branch ?? repo.default_branch);
          if (!path || path.split("/").some((part: string) => !part || part === "." || part === "..") || path.length > 500) return fail("Ruta de archivo inválida.");
          const file = await providerFetch(provider, access, base + "/contents/" + path.split("/").map(encodeURIComponent).join("/") + "?ref=" + encodeURIComponent(branch));
          if (file.type !== "file" || file.encoding !== "base64" || typeof file.content !== "string") return fail("El elemento no es un archivo de texto compatible.");
          if (file.size > 1_000_000) return fail("El archivo supera el límite de vista previa de 1 MB.", 413);
          return json({ path, content: decodeBase64Utf8(file.content) });
        }
        if (action === "create_branch") {
          requireWriteScope(connection);
          const branch = String(body.branch ?? "").trim();
          if (!/^[A-Za-z0-9._/-]{1,100}$/.test(branch) || branch.startsWith("/") || branch.endsWith("/") || branch.includes("..")) return fail("Nombre de rama inválido.");
          const source = String(body.source_branch ?? repo.default_branch);
          const ref = await providerFetch(provider, access, base + "/git/ref/heads/" + encodeURIComponent(source));
          const created = await providerFetch(provider, access, base + "/git/refs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: "refs/heads/" + branch, sha: ref.object.sha }) });
          return json({ created: true, ref: created.ref });
        }
        if (action === "commit_file") {
          requireWriteScope(connection);
          const path = String(body.path ?? "").replace(/^\/+/, "");
          const content = String(body.content ?? "");
          const branch = String(body.branch ?? repo.default_branch);
          const message = String(body.message ?? "").trim();
          if (!path || path.split("/").some((part: string) => !part || part === "." || part === "..") || path.length > 500 || content.length > 500_000 || !message || message.length > 160) return fail("Ruta, mensaje o contenido inválido (máximo 500 KB y mensaje de 160 caracteres).");
          const encodedPath = path.split("/").map(encodeURIComponent).join("/");
          const current = await providerFetchMaybe404(provider, access, base + "/contents/" + encodedPath + "?ref=" + encodeURIComponent(branch));
          const payload: any = { message, content: btoa(unescape(encodeURIComponent(content))), branch };
          if (current?.sha) payload.sha = current.sha;
          const result = await providerFetch(provider, access, base + "/contents/" + encodedPath, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          return json({ committed: true, sha: result.commit?.sha, operation: current?.sha ? "updated" : "created" });
        }
        if (action === "create_review_request") {
          requireWriteScope(connection);
          const sourceBranch = String(body.source_branch ?? "").trim();
          const targetBranch = String(body.target_branch ?? "").trim();
          const title = String(body.title ?? "").trim();
          const description = String(body.description ?? "");
          const validBranch = (value: string) => /^[A-Za-z0-9._/-]{1,100}$/.test(value) && !value.startsWith("/") && !value.endsWith("/") && !value.includes("..");
          if (!validBranch(sourceBranch) || !validBranch(targetBranch) || sourceBranch === targetBranch || !title || title.length > 200 || description.length > 10_000) {
            return fail("Ramas, título o descripción inválidos para la solicitud de revisión.");
          }
          const result = await providerFetch(provider, access, base + "/pulls", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, head: sourceBranch, base: targetBranch, body: description }),
          });
          return json({ created: true, kind: "pull_request", number: result.number, url: result.html_url, state: result.state });
        }
      } else {
        const projectId = encodeURIComponent(repo.external_repo_id);
        const base = "/projects/" + projectId;
        if (action === "list_branches") return json({ items: await providerFetch(provider, access, base + "/repository/branches?per_page=100") });
        if (action === "list_commits") return json({ items: await providerFetch(provider, access, base + "/repository/commits?ref_name=" + encodeURIComponent(String(body.branch ?? repo.default_branch)) + "&per_page=30") });
        if (action === "list_tree") return json({ items: await providerFetch(provider, access, base + "/repository/tree?recursive=true&ref=" + encodeURIComponent(String(body.branch ?? repo.default_branch)) + "&per_page=100") });
        if (action === "get_file") {
          const path = String(body.path ?? "").replace(/^\/+/, "");
          const branch = String(body.branch ?? repo.default_branch);
          if (!path || path.split("/").some((part: string) => !part || part === "." || part === "..") || path.length > 500) return fail("Ruta de archivo inválida.");
          const file = await providerFetch(provider, access, base + "/repository/files/" + encodeURIComponent(path) + "?ref=" + encodeURIComponent(branch));
          if (file.encoding !== "base64" || typeof file.content !== "string") return fail("El archivo no tiene contenido de texto compatible.");
          if (file.size > 1_000_000) return fail("El archivo supera el límite de vista previa de 1 MB.", 413);
          return json({ path, content: decodeBase64Utf8(file.content) });
        }
        if (action === "create_branch") {
          requireWriteScope(connection);
          const branch = String(body.branch ?? "").trim();
          if (!/^[A-Za-z0-9._/-]{1,100}$/.test(branch) || branch.startsWith("/") || branch.endsWith("/") || branch.includes("..")) return fail("Nombre de rama inválido.");
          const created = await providerFetch(provider, access, base + "/repository/branches?branch=" + encodeURIComponent(branch) + "&ref=" + encodeURIComponent(String(body.source_branch ?? repo.default_branch)), { method: "POST" });
          return json({ created: true, name: created.name });
        }
        if (action === "commit_file") {
          requireWriteScope(connection);
          const path = String(body.path ?? "").replace(/^\/+/, "");
          const content = String(body.content ?? "");
          const branch = String(body.branch ?? repo.default_branch);
          const message = String(body.message ?? "").trim();
          if (!path || path.split("/").some((part: string) => !part || part === "." || part === "..") || path.length > 500 || content.length > 500_000 || !message || message.length > 160) return fail("Ruta, mensaje o contenido inválido (máximo 500 KB y mensaje de 160 caracteres).");
          const current = await providerFetchMaybe404(provider, access, base + "/repository/files/" + encodeURIComponent(path) + "?ref=" + encodeURIComponent(branch));
          const actionName = current ? "update" : "create";
          const result = await providerFetch(provider, access, base + "/repository/commits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
            branch, commit_message: message,
            actions: [{ action: actionName, file_path: path, content, ...(current?.last_commit_id ? { last_commit_id: current.last_commit_id } : {}) }],
          }) });
          return json({ committed: true, sha: result.id, operation: current ? "updated" : "created" });
        }
        if (action === "create_review_request") {
          requireWriteScope(connection);
          const sourceBranch = String(body.source_branch ?? "").trim();
          const targetBranch = String(body.target_branch ?? "").trim();
          const title = String(body.title ?? "").trim();
          const description = String(body.description ?? "");
          const validBranch = (value: string) => /^[A-Za-z0-9._/-]{1,100}$/.test(value) && !value.startsWith("/") && !value.endsWith("/") && !value.includes("..");
          if (!validBranch(sourceBranch) || !validBranch(targetBranch) || sourceBranch === targetBranch || !title || title.length > 200 || description.length > 10_000) {
            return fail("Ramas, título o descripción inválidos para la solicitud de revisión.");
          }
          const result = await providerFetch(provider, access, base + "/merge_requests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source_branch: sourceBranch, target_branch: targetBranch, title, description }),
          });
          return json({ created: true, kind: "merge_request", number: result.iid, url: result.web_url, state: result.state });
        }
      }
      return fail("Acción no disponible para este proveedor.");
    }
    return fail("Acción desconocida.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
    return fail(message.slice(0, 400), 502);
  }
});
