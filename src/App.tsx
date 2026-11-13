import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { ArrowUpRight, CheckCircle2, Download, Github, Leaf, LogOut, Plus, Search, ShieldCheck, Sprout } from 'lucide-react';
import GitCenter from './components/GitCenter';

type OsProject = {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  summary: string;
  description: string;
  base_distribution: string;
  desktop_environments: string[];
  architectures: string[];
  source_url: string | null;
  created_at: string;
  status?: 'draft' | 'published';
  visibility?: 'public' | 'private';
};

type OsRelease = {
  id: string;
  version: string;
  channel: string;
  release_notes: string;
  artifact_url: string;
  sha256: string;
  source_commit: string | null;
  created_at: string;
  published_at: string | null;
};
type ProjectComment = { id: string; author_id: string; author_name: string; body: string; created_at: string };

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const supabase: SupabaseClient | null = supabaseUrl && publishableKey
  ? createClient(supabaseUrl, publishableKey)
  : null;

async function ensureProfile(account: User) {
  if (!supabase) return;
  const metadata = account.user_metadata ?? {};
  const candidate = typeof metadata.user_name === 'string'
    ? metadata.user_name
    : typeof metadata.name === 'string'
      ? metadata.name
      : account.email?.split('@')[0] || 'member';
  const baseUsername = candidate.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'member';
  const avatar = typeof metadata.avatar_url === 'string'
    ? metadata.avatar_url
    : typeof metadata.picture === 'string' ? metadata.picture : null;
  const { error } = await supabase.from('profiles').upsert({
    id: account.id,
    username: baseUsername + '-' + account.id.slice(0, 6),
    display_name: typeof metadata.name === 'string' ? metadata.name.slice(0, 80) : candidate.slice(0, 80),
    avatar_url: avatar
  }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) console.warn('Could not initialize public profile:', error.message);
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<OsProject[]>([]);
  const [myProjects, setMyProjects] = useState<OsProject[]>([]);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [showPublish, setShowPublish] = useState(false);
  const [notice, setNotice] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [base, setBase] = useState('ubuntu');
  const [desktop, setDesktop] = useState('lxqt');
  const [architectures, setArchitectures] = useState('x86_64');
  const [sourceUrl, setSourceUrl] = useState('');
  const [releaseVersion, setReleaseVersion] = useState('0.1.0');
  const [releaseChannel, setReleaseChannel] = useState('stable');
  const [artifactUrl, setArtifactUrl] = useState('');
  const [artifactSha256, setArtifactSha256] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [detailProject, setDetailProject] = useState<OsProject | null>(null);
  const [detailReleases, setDetailReleases] = useState<OsRelease[]>([]);
  const [detailComments, setDetailComments] = useState<ProjectComment[]>([]);
  const [detailStars, setDetailStars] = useState(0);
  const [hasStarred, setHasStarred] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [detailBusy, setDetailBusy] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'name'>('newest');

  const loadProjects = useCallback(async () => {
    if (!supabase) {
      setProjects([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('os_projects')
      .select('id,owner_id,slug,name,summary,description,base_distribution,desktop_environments,architectures,source_url,created_at')
      .eq('visibility', 'public')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(60);
    if (error) setNotice('No se pudo cargar el catálogo: ' + error.message);
    else setProjects((data ?? []) as OsProject[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => { const account = data.session?.user ?? null; setUser(account); if (account) void ensureProfile(account); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null); if (session?.user) void ensureProfile(session.user);
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadMyProjects = useCallback(async () => {
    if (!supabase || !user) { setMyProjects([]); return; }
    const { data, error } = await supabase.from('os_projects')
      .select('id,owner_id,slug,name,summary,description,base_distribution,desktop_environments,architectures,source_url,created_at,status,visibility')
      .eq('owner_id', user.id).order('updated_at', { ascending: false });
    if (error) setNotice('No se pudieron cargar tus proyectos: ' + error.message);
    else setMyProjects((data ?? []) as OsProject[]);
  }, [user]);

  useEffect(() => { void loadProjects(); }, [loadProjects]);
  useEffect(() => { void loadMyProjects(); }, [loadMyProjects]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connection = params.get('git_connection');
    const providerMessage = params.get('provider_message');
    if (connection) {
      setNotice(providerMessage || (connection === 'connected' ? 'Proveedor Git conectado.' : 'No se pudo conectar el proveedor Git.'));
      window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    }
  }, []);

  const visibleProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((project) => [
      project.name, project.summary, project.base_distribution,
      ...project.desktop_environments, ...project.architectures
    ].join(' ').toLowerCase().includes(needle));
  }, [projects, query]);

  const sortedProjects = useMemo(() => {
    const next = [...visibleProjects];
    if (sortBy === 'name') next.sort((a, b) => a.name.localeCompare(b.name));
    return next;
  }, [visibleProjects, sortBy]);

  const openProject = async (project: OsProject) => {
    setDetailProject(project);
    setDetailBusy(true);
    setCommentBody('');
    if (!supabase) { setDetailBusy(false); return; }
    const [releaseResult, starResult, commentsResult, ownStarResult] = await Promise.all([
      supabase.from('os_releases').select('id,version,channel,release_notes,artifact_url,sha256,source_commit,created_at,published_at')
        .eq('project_id', project.id).eq('status', 'published').order('created_at', { ascending: false }),
      supabase.from('os_stars').select('user_id', { count: 'exact', head: true }).eq('project_id', project.id),
      supabase.from('os_comments').select('id,author_id,body,created_at').eq('project_id', project.id).order('created_at', { ascending: false }).limit(40),
      user ? supabase.from('os_stars').select('project_id').eq('project_id', project.id).eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null, error: null })
    ]);
    if (releaseResult.error || commentsResult.error || starResult.error || ownStarResult.error) {
      setNotice('No se pudieron cargar todos los detalles del proyecto.');
    }
    setDetailReleases((releaseResult.data ?? []) as OsRelease[]);
    setDetailStars(starResult.count ?? 0);
    setHasStarred(Boolean(ownStarResult.data));
    const comments = commentsResult.data ?? [];
    const authorIds = [...new Set(comments.map((item) => item.author_id))];
    const profileResult = authorIds.length
      ? await supabase.from('profiles').select('id,display_name,username').in('id', authorIds)
      : { data: [], error: null };
    const names = new Map((profileResult.data ?? []).map((profile) => [profile.id, profile.display_name || profile.username]));
    setDetailComments(comments.map((item) => ({
      ...item,
      author_name: names.get(item.author_id) || 'Miembro de Atdev'
    })) as ProjectComment[]);
    setDetailBusy(false);
  };

  const toggleStar = async () => {
    if (!supabase || !user || !detailProject) {
      setNotice('Inicia sesión para marcar un proyecto como favorito.');
      return;
    }
    const result = hasStarred
      ? await supabase.from('os_stars').delete().eq('project_id', detailProject.id).eq('user_id', user.id)
      : await supabase.from('os_stars').insert({ project_id: detailProject.id, user_id: user.id });
    if (result.error) setNotice('No se pudo actualizar el favorito: ' + result.error.message);
    else {
      setHasStarred(!hasStarred);
      setDetailStars((count) => Math.max(0, count + (hasStarred ? -1 : 1)));
    }
  };

  const addComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !user || !detailProject || !commentBody.trim()) return;
    const { error } = await supabase.from('os_comments').insert({
      project_id: detailProject.id, author_id: user.id, body: commentBody.trim()
    });
    if (error) setNotice('No se pudo publicar el comentario: ' + error.message);
    else {
      setCommentBody('');
      await openProject(detailProject);
    }
  };

  const signIn = async (provider: 'github' | 'google') => {
    if (!supabase) return;
    setAuthBusy(true);
    setNotice('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin }
    });
    if (error) {
      setNotice('No se pudo iniciar sesión: ' + error.message);
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) setNotice('No se pudo cerrar sesión: ' + error.message);
  };

  const publishProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !user) return;
    const normalizedSlug = slug.toLowerCase().trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)) {
      setNotice('El identificador debe usar letras minúsculas, números y guiones.');
      return;
    }
    if (sourceUrl && !/^https:\/\//i.test(sourceUrl)) {
      setNotice('La URL del repositorio debe comenzar con https://.');
      return;
    }
    const hasReleaseArtifact = artifactUrl.trim().length > 0 || artifactSha256.trim().length > 0;
    if (hasReleaseArtifact && (!/^https:\/\//i.test(artifactUrl.trim()) || !/^[a-f0-9]{64}$/i.test(artifactSha256.trim()))) {
      setNotice('Para publicar una versión, indica una URL HTTPS y un SHA-256 válido de 64 caracteres.');
      return;
    }
    setPublishing(true);
    setNotice('');
    const projectPayload = {
      slug: normalizedSlug,
      name: name.trim(),
      summary: summary.trim(),
      description: description.trim(),
      base_distribution: base,
      base_release: 'Por especificar',
      desktop_environments: [desktop],
      architectures: architectures.split(',').map((item) => item.trim()).filter(Boolean),
      source_url: sourceUrl.trim() || null,
      visibility: 'public',
      status: 'published'
    };
    let createdProjectId = editingProjectId;
    if (editingProjectId) {
      const { error } = await supabase.from('os_projects').update(projectPayload)
        .eq('id', editingProjectId).eq('owner_id', user.id);
      if (error) {
        setPublishing(false);
        setNotice('No se pudo actualizar el proyecto: ' + error.message);
        return;
      }
    } else {
      const { data: createdProject, error } = await supabase.from('os_projects')
        .insert({ ...projectPayload, owner_id: user.id }).select('id').single();
      if (error || !createdProject) {
        setPublishing(false);
        setNotice('No se pudo publicar el proyecto: ' + (error?.message || 'No se recibió el identificador del proyecto.'));
        return;
      }
      createdProjectId = createdProject.id;
    }
    if (!createdProjectId) {
      setPublishing(false);
      setNotice('No se pudo determinar el proyecto que se está guardando.');
      return;
    }
    if (hasReleaseArtifact) {
      const { error: releaseError } = await supabase.from('os_releases').insert({
        project_id: createdProjectId,
        version: releaseVersion.trim(),
        channel: releaseChannel,
        release_notes: releaseNotes.trim(),
        artifact_url: artifactUrl.trim(),
        sha256: artifactSha256.trim().toLowerCase(),
        status: 'published',
        published_at: new Date().toISOString()
      });
      if (releaseError) setNotice('Sistema publicado, pero no se pudo registrar su versión: ' + releaseError.message);
      else setNotice('Sistema y versión publicados en Atdev OS Hub. Recuerda que el checksum se debe verificar contra el archivo descargado.');
    } else {
      setNotice('Sistema publicado en Atdev OS Hub.');
    }
    setPublishing(false);
    setShowPublish(false);
    setEditingProjectId(null);
    setName(''); setSlug(''); setSummary(''); setDescription(''); setSourceUrl('');
    setArtifactUrl(''); setArtifactSha256(''); setReleaseNotes('');
    await Promise.all([loadProjects(), loadMyProjects()]);
  };

  const startNewProject = () => {
    setEditingProjectId(null);
    setName(''); setSlug(''); setSummary(''); setDescription('');
    setBase('ubuntu'); setDesktop('lxqt'); setArchitectures('x86_64'); setSourceUrl('');
    setReleaseVersion('0.1.0'); setReleaseChannel('stable');
    setArtifactUrl(''); setArtifactSha256(''); setReleaseNotes('');
    setShowPublish(true);
  };

  const editProject = (project: OsProject) => {
    setEditingProjectId(project.id);
    setName(project.name);
    setSlug(project.slug);
    setSummary(project.summary);
    setDescription(project.description || '');
    setBase(project.base_distribution);
    setDesktop(project.desktop_environments[0] || 'none');
    setArchitectures(project.architectures.join(', '));
    setSourceUrl(project.source_url || '');
    setShowPublish(true);
  };

  const deleteProject = async (project: OsProject) => {
    if (!supabase || !user || !window.confirm('¿Eliminar "' + project.name + '"? Esta acción no se puede deshacer.')) return;
    const { error } = await supabase.from('os_projects').delete().eq('id', project.id).eq('owner_id', user.id);
    if (error) setNotice('No se pudo eliminar el proyecto: ' + error.message);
    else {
      setNotice('Proyecto eliminado.');
      await Promise.all([loadProjects(), loadMyProjects()]);
    }
  };

  return (
    <div className="hub-shell">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark"><Leaf size={20} /></span><span>atdev<span className="brand-light"> / os hub</span></span></a>
        <nav><a href="#explore">Explorar</a>{user && <a href="#my-projects">Mis proyectos</a>}<a href="#git-center">Git Center</a><a href="#about">Acerca del Hub</a></nav>
        <div className="account-actions">
          {user ? (
            <>
              <span className="user-label">{user.user_metadata?.user_name || user.email || 'Cuenta conectada'}</span>
              <button className="icon-button" onClick={() => void signOut()} title="Cerrar sesión"><LogOut size={16} /></button>
            </>
          ) : (
            <>
              <button className="login-button" onClick={() => void signIn('github')} disabled={!supabase || authBusy}><Github size={15} /> GitHub</button>
              <button className="login-button" onClick={() => void signIn('google')} disabled={!supabase || authBusy}>Google</button>
            </>
          )}
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><Sprout size={14} /> EL ESPACIO DE LOS SISTEMAS OPERATIVOS</div>
            <h1>Construye algo.<br /><em>Compártelo con el mundo.</em></h1>
            <p>Descubre sistemas operativos creados por la comunidad, explora sus escritorios y encuentra proyectos abiertos para aprender y colaborar.</p>
            <div className="hero-actions">
              <a className="primary-link" href="#explore">Explorar sistemas <ArrowUpRight size={16} /></a>
              <button className="quiet-link" onClick={() => user ? startNewProject() : setNotice('Inicia sesión con GitHub o Google para publicar un sistema.')}>Publicar un sistema <Plus size={15} /></button>
            </div>
            <div className="hero-trust"><ShieldCheck size={14} /> Proyectos con código fuente y checksums transparentes</div>
          </div>
          <div className="pond-art" aria-label="Ilustración de una hoja sobre agua">
            <div className="pond-ring ring-one" /><div className="pond-ring ring-two" />
            <div className="pond-leaf"><Leaf size={72} strokeWidth={1.1} /></div>
            <span className="pond-dot dot-one" /><span className="pond-dot dot-two" /><span className="pond-dot dot-three" />
            <div className="pond-caption">OPEN SOURCE · OPEN SYSTEMS</div>
          </div>
        </section>

        {user && (
          <section id="my-projects" className="my-projects-section">
            <div className="section-heading">
              <div><div className="eyebrow">ESPACIO DE CREACIÓN</div><h2>Mis proyectos</h2><p>Administra tus sistemas operativos y sus publicaciones.</p></div>
              <button className="publish-button" onClick={() => startNewProject()}><Plus size={16} /> Nuevo proyecto</button>
            </div>
            {myProjects.length === 0 ? <div className="my-projects-empty">Todavía no has publicado proyectos. Crea el primero para compartirlo con la comunidad.</div> : (
              <div className="my-project-list">
                {myProjects.map((project) => (
                  <article className="my-project-row" key={project.id}>
                    <div className="my-project-symbol"><Leaf size={19} /></div>
                    <div className="my-project-info"><strong>{project.name}</strong><span>/{project.slug} · {project.base_distribution} · {project.architectures.join(', ')}</span></div>
                    <span className={'my-project-state ' + (project.status === 'published' ? 'is-published' : 'is-draft')}>{project.status === 'published' ? 'Publicado' : 'Borrador'}</span>
                    <button onClick={() => editProject(project)}>Editar</button>
                    <button className="my-project-delete" onClick={() => void deleteProject(project)}>Eliminar</button>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        <GitCenter supabase={supabase} user={user} />

        <section id="explore" className="catalog-section">
          <div className="section-heading">
            <div><div className="eyebrow">CATÁLOGO COMUNITARIO</div><h2>Sistemas para descubrir</h2><p>Distribuciones, remixes y proyectos experimentales.</p></div>
            <button className="publish-button" onClick={() => user ? startNewProject() : setNotice('Inicia sesión con GitHub o Google para publicar.')}><Plus size={16} /> Publicar proyecto</button>
          </div>
          <div className="catalog-tools">
            <label className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, base, escritorio o arquitectura..." /></label>
            <select className="sort-select" value={sortBy} onChange={(event) => setSortBy(event.target.value as 'newest' | 'name')} aria-label="Ordenar proyectos">
              <option value="newest">Más recientes</option><option value="name">Nombre A–Z</option>
            </select>
            <span>{visibleProjects.length} proyectos</span>
          </div>

          {!supabase && <div className="setup-notice"><ShieldCheck size={18} /><div><strong>Atdev OS Hub está preparado, falta conectar Supabase.</strong><p>Copia apps/os-hub/.env.example a .env.local y configura la URL y la clave publicable de un proyecto activo.</p></div></div>}
          {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')}>Cerrar</button></div>}
          {loading ? <div className="empty-state">Cargando catálogo...</div> : visibleProjects.length === 0 ? (
            <div className="empty-state"><div className="empty-icon"><Leaf size={24} /></div><h3>El estanque está esperando sus primeros proyectos.</h3><p>Publica una distribución y comparte su documentación, repositorio y próximas versiones.</p></div>
          ) : (
            <div className="project-grid">
              {sortedProjects.map((project) => (
                <article className="project-card" key={project.id}>
                  <div className="project-art"><Leaf size={28} /><span>{project.base_distribution}</span></div>
                  <div className="project-card-body">
                    <div className="project-card-top"><h3>{project.name}</h3><span className="project-status"><CheckCircle2 size={12} /> Publicado</span></div>
                    <p>{project.summary}</p>
                    <div className="tag-list"><span>{project.base_distribution}</span>{project.desktop_environments.map((item) => <span key={item}>{item}</span>)}{project.architectures.map((item) => <span key={item}>{item}</span>)}</div>
                    <div className="project-card-footer">{project.source_url ? <a href={project.source_url} target="_blank" rel="noreferrer">Código fuente <ArrowUpRight size={13} /></a> : <span>Sin repositorio enlazado</span>}<span className="project-date">{new Date(project.created_at).toLocaleDateString()}</span></div>
                    <button className="project-details-button" onClick={() => void openProject(project)}>Ver detalles <ArrowUpRight size={14} /></button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section id="about" className="about-strip"><div><div className="eyebrow">HECHO PARA CREADORES</div><h2>Tu sistema. Tu comunidad. Tu código.</h2><p>Atdev OS Hub conecta la publicación con el desarrollo. Crea tu proyecto en Void Memingo y comparte sus lanzamientos aquí.</p></div><div className="about-mark"><Leaf size={40} /></div></section>
      </main>

      <footer><span>© 2026 Atdev Dev</span><span>Atdev OS Hub · Un proyecto abierto de la comunidad</span></footer>

      {detailProject && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailProject(null); }}>
          <section className="project-detail-modal" role="dialog" aria-modal="true" aria-label={detailProject.name}>
            <div className="modal-heading">
              <div><div className="eyebrow">PROYECTO DE LA COMUNIDAD</div><h2>{detailProject.name}</h2><span className="detail-slug">/{detailProject.slug}</span></div>
              <button type="button" className="icon-button" onClick={() => setDetailProject(null)} aria-label="Cerrar detalles">×</button>
            </div>
            <p className="detail-summary">{detailProject.summary}</p>
            <div className="tag-list detail-tags"><span>{detailProject.base_distribution}</span>{detailProject.desktop_environments.map((item) => <span key={item}>{item}</span>)}{detailProject.architectures.map((item) => <span key={item}>{item}</span>)}</div>
            <div className="detail-description">{detailProject.description || 'El autor todavía no ha agregado una descripción extendida.'}</div>
            <div className="detail-actions">
              <button className={'detail-star' + (hasStarred ? ' is-starred' : '')} onClick={() => void toggleStar()}><Leaf size={15} /> {hasStarred ? 'Guardado' : 'Guardar'} · {detailStars}</button>
              {detailProject.source_url && <a className="detail-source" href={detailProject.source_url} target="_blank" rel="noreferrer">Ver código fuente <ArrowUpRight size={14} /></a>}
            </div>
            <div className="detail-section">
              <div className="detail-section-title"><h3>Lanzamientos</h3><span>{detailReleases.length} versiones</span></div>
              {detailBusy ? <p className="detail-muted">Cargando lanzamientos…</p> : detailReleases.length === 0 ? <p className="detail-muted">Todavía no hay versiones publicadas.</p> : detailReleases.map((release) => (
                <article className="release-card" key={release.id}>
                  <div><strong>v{release.version}</strong><span>{release.channel} · {new Date(release.published_at || release.created_at).toLocaleDateString()}</span></div>
                  <a href={release.artifact_url} target="_blank" rel="noreferrer" download>Descargar <Download size={14} /></a>
                  <p>{release.release_notes || 'Sin notas de versión.'}</p>
                  <code>SHA-256: {release.sha256}</code>
                </article>
              ))}
            </div>
            <div className="detail-section">
              <div className="detail-section-title"><h3>Comentarios</h3><span>{detailComments.length}</span></div>
              {user ? (
                <form className="comment-form" onSubmit={(event) => void addComment(event)}>
                  <textarea rows={3} maxLength={3000} required value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="Comparte una pregunta o comentario constructivo…" />
                  <button className="primary-link" disabled={!commentBody.trim()}>Publicar comentario</button>
                </form>
              ) : <p className="detail-muted">Inicia sesión para participar en la conversación.</p>}
              <div className="comment-list">
                {detailComments.map((comment) => <article className="comment-card" key={comment.id}><strong>{comment.author_name}</strong><time>{new Date(comment.created_at).toLocaleString()}</time><p>{comment.body}</p></article>)}
                {!detailBusy && detailComments.length === 0 && <p className="detail-muted">Sé la primera persona en comentar este proyecto.</p>}
              </div>
            </div>
          </section>
        </div>
      )}

      {showPublish && user && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowPublish(false); }}>
          <form className="publish-modal" onSubmit={(event) => void publishProject(event)}>
            <div className="modal-heading"><div><div className="eyebrow">NUEVO PROYECTO</div><h2>{editingProjectId ? 'Editar sistema operativo' : 'Publicar sistema operativo'}</h2></div><button type="button" className="icon-button" onClick={() => { setShowPublish(false); setEditingProjectId(null); }}>×</button></div>
            <label>Nombre<input required maxLength={80} value={name} onChange={(event) => { setName(event.target.value); if (!slug) setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')); }} /></label>
            <label>Identificador<input required maxLength={80} value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="mi-sistema" /></label>
            <label>Descripción corta<input required maxLength={180} value={summary} onChange={(event) => setSummary(event.target.value)} /></label>
            <label>Descripción<textarea required rows={4} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
            <div className="form-row"><label>Base<select value={base} onChange={(event) => setBase(event.target.value)}><option value="ubuntu">Ubuntu</option><option value="debian">Debian</option><option value="arch">Arch Linux</option><option value="other">Otra</option></select></label><label>Escritorio<select value={desktop} onChange={(event) => setDesktop(event.target.value)}><option value="lxqt">LXQt</option><option value="xfce">Xfce</option><option value="gnome">GNOME</option><option value="kde-plasma">KDE Plasma</option><option value="none">Sin escritorio</option></select></label></div>
            <label>Arquitecturas<input value={architectures} onChange={(event) => setArchitectures(event.target.value)} placeholder="x86_64, aarch64" /></label>
            <label>Repositorio fuente (HTTPS)<input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://github.com/usuario/proyecto" /></label>
            <div className="release-form-heading"><strong>Primera versión (opcional)</strong><span>El ISO se aloja fuera de Supabase.</span></div>
            <div className="form-row"><label>Versión<input value={releaseVersion} onChange={(event) => setReleaseVersion(event.target.value)} maxLength={64} /></label><label>Canal<select value={releaseChannel} onChange={(event) => setReleaseChannel(event.target.value)}><option value="stable">Stable</option><option value="beta">Beta</option><option value="alpha">Alpha</option><option value="nightly">Nightly</option></select></label></div>
            <label>URL del archivo ISO (HTTPS)<input value={artifactUrl} onChange={(event) => setArtifactUrl(event.target.value)} placeholder="https://.../pondos.iso" /></label>
            <label>SHA-256 del ISO<input value={artifactSha256} onChange={(event) => setArtifactSha256(event.target.value)} placeholder="64 caracteres hexadecimales" maxLength={64} /></label>
            <label>Notas de versión<textarea rows={2} value={releaseNotes} onChange={(event) => setReleaseNotes(event.target.value)} /></label>
            <button className="primary-link submit-publish" disabled={publishing}>{publishing ? 'Guardando...' : editingProjectId ? 'Guardar cambios' : 'Publicar proyecto'} <ArrowUpRight size={15} /></button>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;
