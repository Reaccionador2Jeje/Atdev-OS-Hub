-- Git provider federation and Void Memingo project/build integration.
-- OAuth tokens are stored as Supabase Vault secrets; only service_role can
-- access the private mapping between a connection and its Vault secret IDs.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists public.git_provider_connections (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check (provider in ('github','gitlab','gitvoid')),
 provider_user_id text not null,
 provider_username text not null,
 instance_url text,
 scopes text[] not null default '{}',
 status text not null default 'connected' check (status in ('connected','expired','revoked','experimental')),
 connected_at timestamptz not null default now(),
 last_verified_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (owner_id, provider, provider_user_id, instance_url),
 check ((provider = 'gitvoid' and status = 'experimental') or provider in ('github','gitlab'))
);

create table if not exists private.git_provider_credentials (
 connection_id uuid primary key references public.git_provider_connections(id) on delete cascade,
 access_token_secret_id uuid not null references vault.secrets(id) on delete restrict,
 refresh_token_secret_id uuid references vault.secrets(id) on delete set null,
 access_token_expires_at timestamptz,
 updated_at timestamptz not null default now()
);
revoke all on private.git_provider_credentials from public, anon, authenticated;
grant select, insert, update, delete on private.git_provider_credentials to service_role;

create table if not exists public.git_repositories (
 id uuid primary key default gen_random_uuid(),
 connection_id uuid not null references public.git_provider_connections(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check (provider in ('github','gitlab','gitvoid')),
 external_repo_id text not null,
 full_name text not null,
 description text not null default '',
 clone_url text,
 web_url text not null check (web_url ~ '^https://'),
 default_branch text not null default 'main',
 visibility text not null default 'private' check (visibility in ('public','private','internal')),
 permissions jsonb not null default '{}'::jsonb,
 last_synced_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (connection_id, external_repo_id),
 unique (id, owner_id)
);

create table if not exists public.os_project_git_links (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.os_projects(id) on delete cascade,
 repository_id uuid not null,
 owner_id uuid not null references auth.users(id) on delete cascade,
 sync_mode text not null default 'read_only' check (sync_mode in ('read_only','publish_releases')),
 created_at timestamptz not null default now(),
 unique (project_id, repository_id),
 foreign key (repository_id, owner_id) references public.git_repositories(id, owner_id) on delete cascade
);

create table if not exists public.os_project_integrations (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.os_projects(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 integration text not null check (integration in ('void_memingo')),
 external_project_id text not null,
 external_project_version text,
 sync_enabled boolean not null default true,
 last_synced_at timestamptz,
 last_sync_status text not null default 'pending' check (last_sync_status in ('pending','succeeded','failed','disabled')),
 last_sync_message text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (owner_id, integration, external_project_id),
 unique (project_id, integration)
);

create table if not exists public.os_builds (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.os_projects(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 integration_id uuid references public.os_project_integrations(id) on delete set null,
 repository_id uuid references public.git_repositories(id) on delete set null,
 version text not null,
 source_commit text,
 build_system text not null default 'void-memingo',
 build_status text not null default 'queued' check (build_status in ('queued','building','succeeded','failed','cancelled')),
 artifact_url text,
 sha256 text check (sha256 is null or sha256 ~ '^[A-Fa-f0-9]{64}$'),
 build_metadata jsonb not null default '{}'::jsonb,
 started_at timestamptz,
 finished_at timestamptz,
 created_at timestamptz not null default now()
);

create index if not exists git_connections_owner_idx on public.git_provider_connections(owner_id, provider);
create index if not exists git_repositories_owner_idx on public.git_repositories(owner_id, provider);
create index if not exists os_project_git_links_project_idx on public.os_project_git_links(project_id);
create index if not exists os_project_integrations_owner_idx on public.os_project_integrations(owner_id, integration);
create index if not exists os_builds_project_created_idx on public.os_builds(project_id, created_at desc);

alter table public.git_provider_connections enable row level security;
alter table public.git_repositories enable row level security;
alter table public.os_project_git_links enable row level security;
alter table public.os_project_integrations enable row level security;
alter table public.os_builds enable row level security;

create policy "Users read their Git provider connections" on public.git_provider_connections for select to authenticated using (owner_id = (select auth.uid()));
create policy "Users register their Git provider connections" on public.git_provider_connections for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "Users update their Git provider connections" on public.git_provider_connections for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Users disconnect their Git provider connections" on public.git_provider_connections for delete to authenticated using (owner_id = (select auth.uid()));

create policy "Users read their Git repositories" on public.git_repositories for select to authenticated using (owner_id = (select auth.uid()));
create policy "Users add their Git repositories" on public.git_repositories for insert to authenticated with check (
 owner_id = (select auth.uid()) and exists (
  select 1 from public.git_provider_connections c
  where c.id = connection_id and c.owner_id = (select auth.uid()) and c.provider = provider
 )
);
create policy "Users update their Git repositories" on public.git_repositories for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Users remove their Git repositories" on public.git_repositories for delete to authenticated using (owner_id = (select auth.uid()));

create policy "Project owners read Git links" on public.os_project_git_links for select to authenticated using (owner_id = (select auth.uid()));
create policy "Project owners link Git repositories" on public.os_project_git_links for insert to authenticated with check (
 owner_id = (select auth.uid())
 and exists (select 1 from public.os_projects p where p.id = project_id and p.owner_id = (select auth.uid()))
 and exists (select 1 from public.git_repositories r where r.id = repository_id and r.owner_id = (select auth.uid()))
);
create policy "Project owners update Git links" on public.os_project_git_links for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Project owners remove Git links" on public.os_project_git_links for delete to authenticated using (owner_id = (select auth.uid()));

create policy "Project owners read Void Memingo integrations" on public.os_project_integrations for select to authenticated using (owner_id = (select auth.uid()));
create policy "Project owners create Void Memingo integrations" on public.os_project_integrations for insert to authenticated with check (
 owner_id = (select auth.uid()) and exists (select 1 from public.os_projects p where p.id = project_id and p.owner_id = (select auth.uid()))
);
create policy "Project owners update Void Memingo integrations" on public.os_project_integrations for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Project owners delete Void Memingo integrations" on public.os_project_integrations for delete to authenticated using (owner_id = (select auth.uid()));

create policy "Public builds and owners can read build history" on public.os_builds for select to anon, authenticated using (
 owner_id = (select auth.uid()) or exists (
  select 1 from public.os_projects p where p.id = project_id and p.visibility = 'public' and p.status = 'published'
 )
);
create policy "Project owners register builds" on public.os_builds for insert to authenticated with check (
 owner_id = (select auth.uid()) and exists (select 1 from public.os_projects p where p.id = project_id and p.owner_id = (select auth.uid()))
);
create policy "Project owners update build status" on public.os_builds for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

grant select, insert, update, delete on public.git_provider_connections, public.git_repositories, public.os_project_git_links, public.os_project_integrations, public.os_builds to authenticated;
grant select on public.os_builds to anon;
comment on table public.git_provider_connections is 'Git provider identities; OAuth tokens are stored in Supabase Vault and referenced only in the private schema.';
comment on table public.git_repositories is 'Repositories imported from GitHub, GitLab or the experimental GitVoid adapter.';
comment on table public.os_project_git_links is 'Links an Atdev OS Hub project to its canonical source repository.';
comment on table public.os_project_integrations is 'External project synchronization, initially for Void Memingo OS Builder projects.';
comment on table public.os_builds is 'Build provenance and artifact metadata submitted by Void Memingo or trusted build clients.';
