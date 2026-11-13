import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import {
  ExternalLink, FolderGit2, GitBranch, GitCommitHorizontal, Github,
  GitBranch, Link2, LockKeyhole, RefreshCw, ShieldCheck
} from 'lucide-react';

type Connection = {
  id: string;
  provider: 'github' | 'gitlab' | 'gitvoid';
  provider_username: string;
  status: string;
  scopes: string[];
};
type Repository = {
  id: string;
  provider: 'github' | 'gitlab' | 'gitvoid';
  full_name: string;
  description: string;
  web_url: string;
  default_branch: string;
  visibility: string;
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
  const [branch, setBranch] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const invoke = useCallback(async (body: Record<string, unknown>) => {
    if (!supabase) throw new Error('Supabase no está configurado.');
    const { data, error } = await supabase.functions.invoke('git-provider', { body });
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
      const [connectionData, repositoryData] = await Promise.all([
        invoke({ action: 'list_connections' }),
        invoke({ action: 'list_repositories' })
      ]);
      setConnections(connectionData.connections ?? []);
      setRepositories(repositoryData.repositories ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cargar Git Center.');
    } finally {
      setBusy('');
    }
  }, [user, supabase, invoke]);

  useEffect(() => { void load(); }, [load]);

  const selected = useMemo(() => repositories.find((item) => item.id === selectedId) ?? null, [repositories, selectedId]);

  const connect = async (provider: 'github' | 'gitlab') => {
    setBusy(provider);
    setMessage('');
    try {
      const data = await invoke({ action: 'connect_url', provider, origin: window.location.origin });
      window.location.assign(data.authorization_url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo iniciar la conexión.');
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
      const [branchData, commitData] = await Promise.all([
        invoke({ action: 'list_branches', repository_id: repository.id }),
        invoke({ action: 'list_commits', repository_id: repository.id, branch: selectedBranch || repository.default_branch })
      ]);
      const nextBranches = (branchData.items ?? []) as GitItem[];
      setBranches(nextBranches);
      setCommits((commitData.items ?? []) as GitItem[]);
      setBranch(selectedBranch || repository.default_branch);
    } catch (error) {
      setBranches([]);
      setCommits([]);
      setMessage(error instanceof Error ? error.message : 'No se pudo inspeccionar el repositorio.');
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
          <div className="git-provider-grid">
            <article className="git-provider-card">
              <div className="git-provider-icon"><Github size={24} /></div>
              <div className="git-provider-copy"><strong>GitHub</strong><span>Repositorios, ramas y commits</span></div>
              <button disabled={!supabase || busy === 'github'} onClick={() => void connect('github')}>{busy === 'github' ? 'Conectando…' : 'Conectar'}</button>
            </article>
            <article className="git-provider-card">
              <div className="git-provider-icon gitlab-icon"><GitBranch size={24} /></div>
              <div className="git-provider-copy"><strong>GitLab</strong><span>Repositorios, ramas y commits</span></div>
              <button disabled={!supabase || busy === 'gitlab'} onClick={() => void connect('gitlab')}>{busy === 'gitlab' ? 'Conectando…' : 'Conectar'}</button>
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

          {selected && (
            <div className="git-panel git-inspector">
              <div className="git-panel-heading">
                <div><h3>{selected.full_name}</h3><span>{selected.provider} · rama predeterminada: {selected.default_branch}</span></div>
                <a href={selected.web_url} target="_blank" rel="noreferrer">Abrir proveedor <ExternalLink size={14} /></a>
              </div>
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
            </div>
          )}
        </>
      )}

      {message && <div className="git-notice" role="status">{message}<button onClick={() => setMessage('')}>Cerrar</button></div>}
      <div className="git-security-note"><ShieldCheck size={15} /> Los tokens permanecen en el servidor, cifrados con Supabase Vault. Esta primera versión ofrece navegación de solo lectura; las operaciones de escritura se habilitarán al configurar permisos específicos.</div>
    </section>
  );
}
