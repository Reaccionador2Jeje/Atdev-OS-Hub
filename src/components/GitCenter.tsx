import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import {
  ExternalLink, FileCode2, Folder, FolderGit2, GitBranch, GitCommitHorizontal,
  Github, Link2, LockKeyhole, RefreshCw, ShieldCheck
} from 'lucide-react';

type Connection = {
  id: string;
  provider: 'github' | 'gitlab' | 'gitvoid';
  provider_username: string;
  status: string;
  scopes: string[];
  write_access: boolean;
};
type ApiToken = { id: string; label: string; token_prefix: string; scopes: string[]; expires_at: string | null; last_used_at: string | null; revoked_at: string | null; created_at: string };
type Repository = {
  id: string;
  provider: 'github' | 'gitlab' | 'gitvoid';
  full_name: string;
  description: string;
  web_url: string;
  default_branch: string;
  visibility: string;
  connection_id: string;
};
type GitItem = Record<string, unknown> & {
  name?: string;
  path?: string;
  type?: string;
  message?: string;
  sha?: string;
  web_url?: string;
  html_url?: string;
  author?: { name?: string; username?: string; date?: string };
  commit?: { message?: string; author?: { name?: string; date?: string } };
};

type Props = { supabase: SupabaseClient | null; user: User | null };

export default function GitCenter({ supabase, user }: Props) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [branches, setBranches] = useState<GitItem[]>([]);
  const [commits, setCommits] = useState<GitItem[]>([]);
  const [treeItems, setTreeItems] = useState<GitItem[]>([]);
  const [filePreview, setFilePreview] = useState<{ path: string; content: string } | null>(null);
  const [branch, setBranch] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [apiTokens, setApiTokens] = useState<ApiToken[]>([]);
  const [tokenLabel, setTokenLabel] = useState('Void Memingo Desktop');
  const [newToken, setNewToken] = useState('');
  const [writeAccess, setWriteAccess] = useState(false);
  const [newBranch, setNewBranch] = useState('');
  const [editingFile, setEditingFile] = useState<{ path: string; content: string } | null>(null);
  const [commitMessage, setCommitMessage] = useState('Update via Atdev OS Hub');
  const [reviewTargetBranch, setReviewTargetBranch] = useState('');
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewDescription, setReviewDescription] = useState('');
  const [reviewUrl, setReviewUrl] = useState('');

  const invoke = useCallback(async (body: Record<string, unknown>) => {
    if (!supabase) throw new Error('Supabase no está configurado.');
    const { data, error } = await supabase.functions.invoke('git-provider', { body });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  }, [supabase]);

  const invokeTokens = useCallback(async (body: Record<string, unknown>) => {
    if (!supabase) throw new Error('Supabase no está configurado.');
    const { data, error } = await supabase.functions.invoke('os-hub-tokens', { body });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  }, [supabase]);

  const load = useCallback(async () => {
    if (!user || !supabase) {
      setConnections([]);
      setRepositories([]);
      return;
    }
    setBusy('load');
    try {
      const [connectionData, repositoryData, tokenData] = await Promise.all([
        invoke({ action: 'list_connections' }),
        invoke({ action: 'list_repositories' }),
        invokeTokens({ action: 'list' })
      ]);
      setConnections(connectionData.connections ?? []);
      setRepositories(repositoryData.repositories ?? []);
      setApiTokens((tokenData.tokens ?? []) as ApiToken[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cargar Git Center.');
    } finally {
      setBusy('');
    }
  }, [user, supabase, invoke, invokeTokens]);

  useEffect(() => { void load(); }, [load]);

  const selected = useMemo(() => repositories.find((item) => item.id === selectedId) ?? null, [repositories, selectedId]);
  const connectedProviders = useMemo(() => new Set(connections.filter((item) => item.status === 'connected').map((item) => item.provider)), [connections]);
  const selectedConnection = useMemo(() => connections.find((item) => item.id === selected?.connection_id) ?? null, [connections, selected]);
  const canWrite = selectedConnection?.status === 'connected' && selectedConnection.write_access === true && (
    selectedConnection.provider === 'github' ||
    (selectedConnection.provider === 'gitlab' && selectedConnection.scopes.includes('api'))
  );

  const connect = async (provider: 'github' | 'gitlab') => {
    setBusy(provider);
    setMessage('');
    try {
      const data = await invoke({ action: 'connect_url', provider, origin: window.location.origin, write_access: writeAccess });
      window.location.assign(data.authorization_url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo iniciar la conexión.');
      setBusy('');
    }
  };

  const createApiToken = async () => {
    if (!tokenLabel.trim()) return;
    setBusy('token');
    setMessage('');
    setNewToken('');
    try {
      const result = await invokeTokens({ action: 'create', label: tokenLabel.trim() });
      setNewToken(result.token);
      setMessage('Token creado. Cópialo ahora: solo se muestra una vez.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo crear el token.');
    } finally {
      setBusy('');
    }
  };

  const revokeApiToken = async (tokenId: string) => {
    setBusy('revoke-' + tokenId);
    try {
      await invokeTokens({ action: 'revoke', token_id: tokenId });
      setMessage('Token revocado.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo revocar el token.');
    } finally {
      setBusy('');
    }
  };

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(newToken);
      setMessage('Token copiado. Guárdalo en un lugar seguro.');
    } catch {
      setMessage('No se pudo copiar automáticamente. Selecciona el token y cópialo.');
    }
  };

  const disconnectConnection = async (connection: Connection) => {
    if (!window.confirm(`Desconectar ${connection.provider_username} de ${connection.provider} en Atdev OS Hub? Se borrarán de Supabase los tokens guardados y los repositorios importados de esta conexión. Esto no revoca el acceso directamente en el proveedor.`)) return;
    setBusy('disconnect-' + connection.id);
    setMessage('');
    try {
      await invoke({ action: 'disconnect_connection', connection_id: connection.id });
      if (selectedConnection?.id === connection.id) {
        setSelectedId('');
        setBranches([]);
        setCommits([]);
        setTreeItems([]);
        setFilePreview(null);
        setEditingFile(null);
      }
      setMessage('Conexión desconectada y credenciales locales eliminadas de Supabase.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo desconectar el proveedor.');
    } finally {
      setBusy('');
    }
  };

  const sync = async (connection: Connection) => {
    setBusy('sync-' + connection.id);
    setMessage('');
    try {
      const result = await invoke({ action: 'sync_repositories', connection_id: connection.id });
      setMessage(`Sincronización completada: ${result.imported} repositorios.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudieron sincronizar los repositorios.');
    } finally {
      setBusy('');
    }
  };

  const inspect = async (repository: Repository, selectedBranch?: string) => {
    setSelectedId(repository.id);
    setBusy('inspect');
    setMessage('');
    try {
      const [branchData, commitData, treeData] = await Promise.all([
        invoke({ action: 'list_branches', repository_id: repository.id }),
        invoke({ action: 'list_commits', repository_id: repository.id, branch: selectedBranch || repository.default_branch }),
        invoke({ action: 'list_tree', repository_id: repository.id, branch: selectedBranch || repository.default_branch })
      ]);
      const nextBranches = (branchData.items ?? []) as GitItem[];
      const treePayload = treeData.items;
      setBranches(nextBranches);
      setCommits((commitData.items ?? []) as GitItem[]);
      setTreeItems((Array.isArray(treePayload) ? treePayload : treePayload?.tree ?? []) as GitItem[]);
      setFilePreview(null);
      setBranch(selectedBranch || repository.default_branch);
      setReviewTargetBranch(repository.default_branch);
      setReviewTitle(`Changes from ${selectedBranch || repository.default_branch}`);
      setReviewDescription('');
      setReviewUrl('');
    } catch (error) {
      setBranches([]);
      setCommits([]);
      setTreeItems([]);
      setFilePreview(null);
      setMessage(error instanceof Error ? error.message : 'No se pudo inspeccionar el repositorio.');
    } finally {
      setBusy('');
    }
  };

  const openRepositoryFile = async (path: string) => {
    if (!selected) return;
    setBusy('file');
    setMessage('');
    try {
      const result = await invoke({ action: 'get_file', repository_id: selected.id, branch, path });
      setFilePreview({ path, content: String(result.content ?? '') });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo abrir el archivo.');
    } finally {
      setBusy('');
    }
  };

  const createBranch = async () => {
    if (!selected || !canWrite || !newBranch.trim()) return;
    const name = newBranch.trim();
    if (!window.confirm(`Crear la rama "${name}" desde "${branch}" en ${selected.full_name}?`)) return;
    setBusy('write');
    setMessage('');
    try {
      await invoke({ action: 'create_branch', repository_id: selected.id, branch: name, source_branch: branch });
      setNewBranch('');
      setMessage(`Rama "${name}" creada.`);
      await inspect(selected, name);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo crear la rama.');
    } finally {
      setBusy('');
    }
  };

  const beginEdit = () => {
    if (!filePreview || !canWrite) return;
    setEditingFile({ ...filePreview });
    setCommitMessage(`Update ${filePreview.path}`);
  };

  const saveFile = async () => {
    if (!selected || !editingFile || !canWrite || !commitMessage.trim()) return;
    const path = editingFile.path;
    if (!window.confirm(`Confirmar commit de "${path}" en "${branch}" del repositorio ${selected.full_name}? Esta acción modificará el repositorio remoto.`)) return;
    setBusy('write');
    setMessage('');
    try {
      const result = await invoke({
        action: 'commit_file', repository_id: selected.id, branch,
        path, content: editingFile.content, message: commitMessage.trim()
      });
      setEditingFile(null);
      setMessage(`Archivo ${result.operation === 'created' ? 'creado' : 'actualizado'} · commit ${String(result.sha ?? '').slice(0, 8)}.`);
      await inspect(selected, branch);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar el archivo.');
    } finally {
      setBusy('');
    }
  };

  const createReviewRequest = async () => {
    if (!selected || !canWrite || !branch || !reviewTargetBranch || branch === reviewTargetBranch || !reviewTitle.trim()) return;
    const kind = selected.provider === 'github' ? 'Pull Request' : 'Merge Request';
    if (!window.confirm(`Crear ${kind} desde "${branch}" hacia "${reviewTargetBranch}" en ${selected.full_name}?`)) return;
    setBusy('review');
    setMessage('');
    setReviewUrl('');
    try {
      const result = await invoke({
        action: 'create_review_request',
        repository_id: selected.id,
        source_branch: branch,
        target_branch: reviewTargetBranch,
        title: reviewTitle.trim(),
        description: reviewDescription.trim()
      });
      setReviewUrl(String(result.url ?? ''));
      setMessage(`${kind} #${result.number ?? ''} creado correctamente.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `No se pudo crear el ${kind}.`);
    } finally {
      setBusy('');
    }
  };

  const changeBranch = async (next: string) => {
    if (selected) await inspect(selected, next);
  };

  return (
    <section id="git-center" className="git-center-section">
      <div className="section-heading git-center-heading">
        <div>
          <div className="eyebrow"><GitBranch size={14} /> ATDEV GIT CENTER</div>
          <h2>Tu código, conectado.</h2>
          <p>Conecta proveedores, importa repositorios y revisa ramas e historial desde Atdev OS Hub.</p>
        </div>
        <span className="git-mode"><LockKeyhole size={14} /> Acceso autorizado por cuenta</span>
      </div>

      {!supabase && <div className="git-notice">Configura Supabase para activar Git Center.</div>}
      {!user && <div className="git-empty"><ShieldCheck size={22} /><strong>Inicia sesión para conectar tus repositorios.</strong><span>Las conexiones Git son independientes del inicio de sesión de Atdev OS Hub.</span></div>}

      {user && (
        <>
          <label className="git-write-consent">
            <input type="checkbox" checked={writeAccess} onChange={(event) => setWriteAccess(event.target.checked)} />
            <span><strong>Solicitar permisos de escritura</strong><small>Desactivado por defecto. GitHub solicitará el alcance repo y GitLab el alcance api. Solo autorízalo si quieres crear ramas y guardar archivos desde Git Center.</small></span>
          </label>
          <div className="git-provider-grid">
            <article className="git-provider-card">
              <div className="git-provider-icon"><Github size={24} /></div>
              <div className="git-provider-copy"><strong>GitHub</strong><span>Repositorios, ramas y commits</span>{connectedProviders.has('github') && <small className="git-connected">Cuenta vinculada</small>}</div>
              <button disabled={!supabase || busy === 'github'} onClick={() => void connect('github')}>{busy === 'github' ? 'Conectando…' : connectedProviders.has('github') ? 'Reconectar' : 'Conectar'}</button>
            </article>
            <article className="git-provider-card">
              <div className="git-provider-icon gitlab-icon"><GitBranch size={24} /></div>
              <div className="git-provider-copy"><strong>GitLab</strong><span>Repositorios, ramas y commits</span>{connectedProviders.has('gitlab') && <small className="git-connected">Cuenta vinculada</small>}</div>
              <button disabled={!supabase || busy === 'gitlab'} onClick={() => void connect('gitlab')}>{busy === 'gitlab' ? 'Conectando…' : connectedProviders.has('gitlab') ? 'Reconectar' : 'Conectar'}</button>
            </article>
            <article className="git-provider-card git-provider-experimental">
              <div className="git-provider-icon"><GitBranch size={24} /></div>
              <div className="git-provider-copy"><strong>GitVoid</strong><span>Proveedor nativo Atdev</span></div>
              <span className="git-experimental">Experimental</span>
            </article>
          </div>

          <div className="git-dashboard-grid">
            <div className="git-panel">
              <div className="git-panel-heading"><div><h3>Conexiones</h3><span>{connections.length} cuentas vinculadas</span></div><button className="git-refresh" onClick={() => void load()} disabled={busy !== ''}><RefreshCw size={15} /> Actualizar</button></div>
              {connections.length === 0 ? <div className="git-panel-empty">Todavía no hay proveedores conectados.</div> : connections.map((connection) => (
                <div className="git-connection-row" key={connection.id}>
                  <div className="git-connection-mark">{connection.provider === 'github' ? <Github size={18} /> : <GitBranch size={18} />}</div>
                  <div className="git-connection-info"><strong>{connection.provider_username}</strong><span>{connection.provider} · {connection.scopes.length ? connection.scopes.join(', ') : 'permisos del proveedor'}</span></div>
                  <span className="git-connected">Conectado</span>
                  <button className="git-sync-button" onClick={() => void sync(connection)} disabled={busy !== ''}><RefreshCw size={14} /> {busy === 'sync-' + connection.id ? 'Sincronizando' : 'Sincronizar'}</button>
                  <button className="git-disconnect-button" onClick={() => void disconnectConnection(connection)} disabled={busy !== ''}>{busy === 'disconnect-' + connection.id ? 'Desconectando…' : 'Desconectar'}</button>
                </div>
              ))}
            </div>

            <div className="git-panel">
              <div className="git-panel-heading"><div><h3>Repositorios</h3><span>{repositories.length} importados</span></div><FolderGit2 size={19} /></div>
              {repositories.length === 0 ? <div className="git-panel-empty">Conecta una cuenta y sincroniza tus repositorios para comenzar.</div> : (
                <div className="git-repository-list">
                  {repositories.map((repository) => (
                    <button className={'git-repository-row' + (selectedId === repository.id ? ' is-selected' : '')} key={repository.id} onClick={() => void inspect(repository)}>
                      <span className="git-repo-symbol">{repository.provider === 'github' ? <Github size={17} /> : <GitBranch size={17} />}</span>
                      <span className="git-repo-copy"><strong>{repository.full_name}</strong><small>{repository.description || repository.provider + ' repository'}</small></span>
                      <span className="git-repo-visibility">{repository.visibility}</span>
                      <ExternalLink size={14} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="git-panel git-token-panel">
            <div className="git-panel-heading">
              <div><h3>Void Memingo · Acceso API</h3><span>Permite publicar proyectos y registrar compilaciones desde el OS Builder.</span></div>
              <LockKeyhole size={18} />
            </div>
            <div className="git-token-create">
              <input value={tokenLabel} onChange={(event) => setTokenLabel(event.target.value)} maxLength={80} aria-label="Nombre del token" placeholder="Nombre del token" />
              <button onClick={() => void createApiToken()} disabled={busy !== '' || !tokenLabel.trim()}>{busy === 'token' ? 'Creando…' : 'Crear token'}</button>
            </div>
            {newToken && (
              <div className="git-token-once">
                <strong>Token nuevo — copia ahora, no volverá a mostrarse</strong>
                <code>{newToken}</code>
                <button onClick={() => void copyToken()}>Copiar token</button>
              </div>
            )}
            <div className="git-token-list">
              {apiTokens.map((token) => (
                <div className="git-token-row" key={token.id}>
                  <div><strong>{token.label}</strong><small>{token.token_prefix}… · {token.scopes.join(', ')}</small></div>
                  <span className={token.revoked_at ? 'git-token-revoked' : 'git-connected'}>{token.revoked_at ? 'Revocado' : token.expires_at && new Date(token.expires_at) < new Date() ? 'Vencido' : 'Activo'}</span>
                  {!token.revoked_at && <button onClick={() => void revokeApiToken(token.id)} disabled={busy !== ''}>Revocar</button>}
                </div>
              ))}
              {apiTokens.length === 0 && <div className="git-panel-empty">Todavía no hay tokens de Void Memingo.</div>}
            </div>
            <p className="git-token-help">El token solo se muestra una vez y se guarda como hash. No lo compartas ni lo incluyas en void-os.toml o en Git.</p>
          </div>

          {selected && (
            <div className="git-panel git-inspector">
              <div className="git-panel-heading">
                <div><h3>{selected.full_name}</h3><span>{selected.provider} · rama predeterminada: {selected.default_branch}</span></div>
                <a href={selected.web_url} target="_blank" rel="noreferrer">Abrir proveedor <ExternalLink size={14} /></a>
              </div>
              <div className="git-write-toolbar">
                {canWrite ? (
                  <>
                    <span className="git-write-enabled"><ShieldCheck size={14} /> Escritura autorizada</span>
                    <input value={newBranch} onChange={(event) => setNewBranch(event.target.value)} maxLength={100} placeholder="Nombre de nueva rama" aria-label="Nombre de nueva rama" />
                    <button onClick={() => void createBranch()} disabled={busy !== '' || !newBranch.trim()}>{busy === 'write' ? 'Procesando…' : 'Crear rama'}</button>
                  </>
                ) : <span className="git-write-readonly"><LockKeyhole size={14} /> Solo lectura. Reconecta con permisos de escritura para crear ramas o commits.</span>}
              </div>
              {canWrite && (
                <div className="git-review-request">
                  <div className="git-subheading">{selected.provider === 'github' ? 'Pull Request' : 'Merge Request'}</div>
                  <div className="git-review-fields">
                    <label>Rama de destino
                      <select value={reviewTargetBranch} onChange={(event) => setReviewTargetBranch(event.target.value)}>
                        {branches.map((item) => <option key={String(item.name)} value={String(item.name)}>{String(item.name)}</option>)}
                      </select>
                    </label>
                    <label>Título
                      <input value={reviewTitle} onChange={(event) => setReviewTitle(event.target.value)} maxLength={200} placeholder="Resumen de los cambios" />
                    </label>
                    <label>Descripción
                      <textarea value={reviewDescription} onChange={(event) => setReviewDescription(event.target.value)} maxLength={10000} rows={3} placeholder="Describe los cambios para quienes revisarán el código." />
                    </label>
                    <button onClick={() => void createReviewRequest()} disabled={busy !== '' || !reviewTitle.trim() || !branch || branch === reviewTargetBranch}>
                      {busy === 'review' ? 'Creando…' : selected.provider === 'github' ? 'Crear Pull Request' : 'Crear Merge Request'}
                    </button>
                    {branch === reviewTargetBranch && <small>Selecciona una rama de destino distinta de la rama actual.</small>}
                    {reviewUrl && <a href={reviewUrl} target="_blank" rel="noreferrer">Abrir solicitud de revisión</a>}
                  </div>
                </div>
              )}
              <div className="git-inspector-columns">
                <div>
                  <label className="git-field-label"><GitBranch size={14} /> Rama</label>
                  <select value={branch} onChange={(event) => void changeBranch(event.target.value)}>
                    {branches.map((item) => <option key={String(item.name)} value={String(item.name)}>{String(item.name)}</option>)}
                  </select>
                  <div className="git-subheading">Ramas disponibles</div>
                  <ul className="git-branch-list">{branches.map((item) => <li key={String(item.name)}>{String(item.name)}</li>)}</ul>
                </div>
                <div>
                  <div className="git-subheading"><GitCommitHorizontal size={15} /> Commits recientes</div>
                  <div className="git-commit-list">
                    {commits.map((item, index) => {
                      const sha = String(item.sha ?? item.id ?? '');
                      const title = String(item.commit?.message ?? item.message ?? 'Commit');
                      const author = String(item.commit?.author?.name ?? item.author?.name ?? item.author?.username ?? 'Autor');
                      return <article className="git-commit-item" key={sha || index}><span className="git-commit-dot" /><div><strong>{title.split('\n')[0]}</strong><small>{author} · {sha.slice(0, 8)}</small></div></article>;
                    })}
                    {commits.length === 0 && <div className="git-panel-empty">No hay commits para esta rama.</div>}
                  </div>
                </div>
              </div>
              <div className="git-file-browser">
                <div className="git-subheading"><Folder size={15} /> Archivos del repositorio</div>
                <div className="git-file-list">
                  {treeItems.filter((item) => item.type === 'blob' || item.type === 'tree').map((item) => (
                    <button key={String(item.path)} className={'git-file-row' + (filePreview?.path === item.path ? ' is-selected' : '')}
                      onClick={() => item.type === 'blob' ? void openRepositoryFile(String(item.path)) : undefined}
                      disabled={item.type !== 'blob' || busy !== ''}>
                      {item.type === 'tree' ? <Folder size={14} /> : <FileCode2 size={14} />}
                      <span>{String(item.path)}</span>
                      {item.type === 'blob' && <small>{item.size ? String(item.size) + ' B' : 'Archivo'}</small>}
                    </button>
                  ))}
                  {treeItems.length === 0 && <div className="git-panel-empty">No hay archivos para mostrar.</div>}
                </div>
                {filePreview && (
                  <div className="git-file-preview">
                    <div className="git-file-preview-heading">
                      <strong>{filePreview.path}</strong>
                      <div>{canWrite && <button onClick={() => editingFile ? setEditingFile(null) : beginEdit()}>{editingFile ? 'Cancelar edición' : 'Editar archivo'}</button>}<button onClick={() => { setFilePreview(null); setEditingFile(null); }}>Cerrar</button></div>
                    </div>
                    {editingFile ? (
                      <div className="git-file-editor">
                        <label>Contenido del archivo<textarea value={editingFile.content} onChange={(event) => setEditingFile({ ...editingFile, content: event.target.value })} maxLength={500000} spellCheck={false} /></label>
                        <label>Mensaje del commit<input value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} maxLength={160} /></label>
                        <div className="git-file-editor-actions"><span>{editingFile.content.length.toLocaleString()} / 500.000 caracteres · rama {branch}</span><button onClick={() => void saveFile()} disabled={busy !== '' || !commitMessage.trim()}>{busy === 'write' ? 'Guardando…' : 'Confirmar commit'}</button></div>
                      </div>
                    ) : <pre>{filePreview.content}</pre>}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {message && <div className="git-notice" role="status">{message}<button onClick={() => setMessage('')}>Cerrar</button></div>}
      <div className="git-security-note"><ShieldCheck size={15} /> Los tokens se guardan en Supabase Vault y se eliminan al desconectar. Desconectar no revoca automáticamente el permiso en GitHub o GitLab; revócalo también desde el proveedor si quieres retirar el acceso remoto. La escritura exige consentimiento OAuth y confirmación por operación. GitVoid continúa experimental.</div>
    </section>
  );
}
