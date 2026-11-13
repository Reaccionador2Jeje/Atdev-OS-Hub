import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { ArrowUpRight, CheckCircle2, Download, Github, Leaf, LogOut, Plus, Search, ShieldCheck, Sprout } from 'lucide-react';
import GitCenter from './components/GitCenter';

type OsProject = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  base_distribution: string;
  desktop_environments: string[];
  architectures: string[];
  source_url: string | null;
  created_at: string;
};

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

  const loadProjects = useCallback(async () => {
    if (!supabase) {
      setProjects([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('os_projects')
      .select('id,slug,name,summary,base_distribution,desktop_environments,architectures,source_url,created_at')
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

  useEffect(() => { void loadProjects(); }, [loadProjects]);

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
    const { data: createdProject, error } = await supabase.from('os_projects').insert({
      owner_id: user.id,
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
    }).select('id').single();
    if (error || !createdProject) {
      setPublishing(false);
      setNotice('No se pudo publicar el proyecto: ' + (error?.message || 'No se recibió el identificador del proyecto.'));
      return;
    }
    if (hasReleaseArtifact) {
      const { error: releaseError } = await supabase.from('os_releases').insert({
        project_id: createdProject.id,
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
    setName(''); setSlug(''); setSummary(''); setDescription(''); setSourceUrl('');
    setArtifactUrl(''); setArtifactSha256(''); setReleaseNotes('');
    await loadProjects();
  };

  return (
    <div className="hub-shell">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark"><Leaf size={20} /></span><span>atdev<span className="brand-light"> / os hub</span></span></a>
        <nav><a href="#explore">Explorar</a><a href="#git-center">Git Center</a><a href="#about">Acerca del Hub</a></nav>
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
              <button className="quiet-link" onClick={() => user ? setShowPublish(true) : setNotice('Inicia sesión con GitHub o Google para publicar un sistema.')}>Publicar un sistema <Plus size={15} /></button>
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

        <GitCenter supabase={supabase} user={user} />

        <section id="explore" className="catalog-section">
          <div className="section-heading">
            <div><div className="eyebrow">CATÁLOGO COMUNITARIO</div><h2>Sistemas para descubrir</h2><p>Distribuciones, remixes y proyectos experimentales.</p></div>
            <button className="publish-button" onClick={() => user ? setShowPublish(true) : setNotice('Inicia sesión con GitHub o Google para publicar.')}><Plus size={16} /> Publicar proyecto</button>
          </div>
          <div className="catalog-tools">
            <label className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, base, escritorio o arquitectura..." /></label>
            <span>{visibleProjects.length} proyectos</span>
          </div>

          {!supabase && <div className="setup-notice"><ShieldCheck size={18} /><div><strong>Atdev OS Hub está preparado, falta conectar Supabase.</strong><p>Copia apps/os-hub/.env.example a .env.local y configura la URL y la clave publicable de un proyecto activo.</p></div></div>}
          {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')}>Cerrar</button></div>}
          {loading ? <div className="empty-state">Cargando catálogo...</div> : visibleProjects.length === 0 ? (
            <div className="empty-state"><div className="empty-icon"><Leaf size={24} /></div><h3>El estanque está esperando sus primeros proyectos.</h3><p>Publica una distribución y comparte su documentación, repositorio y próximas versiones.</p></div>
          ) : (
            <div className="project-grid">
              {visibleProjects.map((project) => (
                <article className="project-card" key={project.id}>
                  <div className="project-art"><Leaf size={28} /><span>{project.base_distribution}</span></div>
                  <div className="project-card-body">
                    <div className="project-card-top"><h3>{project.name}</h3><span className="project-status"><CheckCircle2 size={12} /> Publicado</span></div>
                    <p>{project.summary}</p>
                    <div className="tag-list"><span>{project.base_distribution}</span>{project.desktop_environments.map((item) => <span key={item}>{item}</span>)}{project.architectures.map((item) => <span key={item}>{item}</span>)}</div>
                    <div className="project-card-footer">{project.source_url ? <a href={project.source_url} target="_blank" rel="noreferrer">Código fuente <ArrowUpRight size={13} /></a> : <span>Sin repositorio enlazado</span>}<span className="project-date">{new Date(project.created_at).toLocaleDateString()}</span></div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section id="about" className="about-strip"><div><div className="eyebrow">HECHO PARA CREADORES</div><h2>Tu sistema. Tu comunidad. Tu código.</h2><p>Atdev OS Hub conecta la publicación con el desarrollo. Crea tu proyecto en Void Memingo y comparte sus lanzamientos aquí.</p></div><div className="about-mark"><Leaf size={40} /></div></section>
      </main>

      <footer><span>© 2026 Atdev Dev</span><span>Atdev OS Hub · Un proyecto abierto de la comunidad</span></footer>

      {showPublish && user && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowPublish(false); }}>
          <form className="publish-modal" onSubmit={(event) => void publishProject(event)}>
            <div className="modal-heading"><div><div className="eyebrow">NUEVO PROYECTO</div><h2>Publicar sistema operativo</h2></div><button type="button" className="icon-button" onClick={() => setShowPublish(false)}>×</button></div>
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
            <button className="primary-link submit-publish" disabled={publishing}>{publishing ? 'Publicando...' : 'Publicar proyecto'} <ArrowUpRight size={15} /></button>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;
