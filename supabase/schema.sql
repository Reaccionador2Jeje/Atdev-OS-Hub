-- Draft schema for Atdev OS Hub.
-- Review and apply only to an active Supabase project after configuring OAuth.
-- This file is intentionally not an auto-applied migration.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9_-]{2,31}$'),
  display_name text not null default '',
  avatar_url text,
  bio text not null default '' check (char_length(bio) <= 500),
  created_at timestamptz not null default now()
);

create table if not exists public.os_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 2 and 80),
  summary text not null check (char_length(summary) between 5 and 180),
  description text not null default '',
  license text not null default 'NOASSERTION',
  base_distribution text not null default 'other',
  base_release text not null default '',
  architectures text[] not null default array['x86_64']::text[],
  desktop_environments text[] not null default array[]::text[],
  source_url text check (source_url is null or source_url ~ '^https://'),
  visibility text not null default 'public' check (visibility in ('public','private')),
  status text not null default 'draft' check (status in ('draft','published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slug)
);

create table if not exists public.os_releases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.os_projects(id) on delete cascade,
  version text not null check (char_length(version) between 1 and 64),
  channel text not null default 'stable' check (channel in ('stable','beta','alpha','nightly')),
  release_notes text not null default '',
  artifact_url text not null check (artifact_url ~ '^https://'),
  artifact_size_bytes bigint check (artifact_size_bytes is null or artifact_size_bytes > 0),
  sha256 text not null check (sha256 ~ '^[A-Fa-f0-9]{64}$'),
  source_commit text,
  builder_version text,
  status text not null default 'draft' check (status in ('draft','published')),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (project_id, version)
);

create table if not exists public.os_screenshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.os_projects(id) on delete cascade,
  object_path text not null,
  alt_text text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, object_path)
);

create table if not exists public.os_stars (
  project_id uuid not null references public.os_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.os_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.os_projects(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists os_projects_public_created_idx
  on public.os_projects (created_at desc)
  where visibility = 'public' and status = 'published';
create index if not exists os_releases_project_created_idx
  on public.os_releases (project_id, created_at desc);
create index if not exists os_comments_project_created_idx
  on public.os_comments (project_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.os_projects enable row level security;
alter table public.os_releases enable row level security;
alter table public.os_screenshots enable row level security;
alter table public.os_stars enable row level security;
alter table public.os_comments enable row level security;

-- Profiles are public display information; each user controls their own row.
create policy "Public profiles are readable"
  on public.profiles for select to anon, authenticated using (true);
create policy "Users create their own profile"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Published projects are public; owners can also see private drafts.
create policy "Read published projects or owned drafts"
  on public.os_projects for select to anon, authenticated
  using (
    (visibility = 'public' and status = 'published')
    or owner_id = (select auth.uid())
  );
create policy "Owners publish projects"
  on public.os_projects for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "Owners update projects"
  on public.os_projects for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "Owners delete projects"
  on public.os_projects for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "Read public releases or owned releases"
  on public.os_releases for select to anon, authenticated
  using (
    exists (
      select 1 from public.os_projects p
      where p.id = project_id
        and (
          (p.visibility = 'public' and p.status = 'published' and os_releases.status = 'published')
          or p.owner_id = (select auth.uid())
        )
    )
  );
create policy "Project owners create releases"
  on public.os_releases for insert to authenticated
  with check (exists (
    select 1 from public.os_projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  ));
create policy "Project owners update releases"
  on public.os_releases for update to authenticated
  using (exists (
    select 1 from public.os_projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.os_projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  ));
create policy "Project owners delete releases"
  on public.os_releases for delete to authenticated
  using (exists (
    select 1 from public.os_projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  ));

create policy "Read screenshots for public projects"
  on public.os_screenshots for select to anon, authenticated
  using (exists (
    select 1 from public.os_projects p
    where p.id = project_id and p.visibility = 'public' and p.status = 'published'
  ));
create policy "Project owners manage screenshots"
  on public.os_screenshots for all to authenticated
  using (exists (
    select 1 from public.os_projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.os_projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  ));

create policy "Read stars for public projects"
  on public.os_stars for select to anon, authenticated
  using (exists (
    select 1 from public.os_projects p
    where p.id = project_id and p.visibility = 'public' and p.status = 'published'
  ));
create policy "Users star public projects"
  on public.os_stars for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.os_projects p
      where p.id = project_id and p.visibility = 'public' and p.status = 'published'
    )
  );
create policy "Users remove their stars"
  on public.os_stars for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Read comments on public projects"
  on public.os_comments for select to anon, authenticated
  using (exists (
    select 1 from public.os_projects p
    where p.id = project_id and p.visibility = 'public' and p.status = 'published'
  ));
create policy "Authenticated users comment on public projects"
  on public.os_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.os_projects p
      where p.id = project_id and p.visibility = 'public' and p.status = 'published'
    )
  );
create policy "Authors update their comments"
  on public.os_comments for update to authenticated
  using (author_id = (select auth.uid()))
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.os_projects p
      where p.id = project_id and p.visibility = 'public' and p.status = 'published'
    )
  );
create policy "Authors delete their comments"
  on public.os_comments for delete to authenticated
  using (author_id = (select auth.uid()));

grant select on public.profiles, public.os_projects, public.os_releases,
  public.os_screenshots, public.os_stars, public.os_comments to anon, authenticated;
grant insert, update, delete on public.profiles, public.os_projects,
  public.os_releases, public.os_screenshots, public.os_stars,
  public.os_comments to authenticated;

-- Supabase changed the default Data API exposure behavior in 2026.
-- Keep these grants explicit and ensure the public schema is enabled in
-- Project Settings -> API -> Exposed schemas before using the browser client.
-- Store screenshots only; ISO files remain on the project's release host.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'os-screenshots',
  'os-screenshots',
  true,
  5242880,
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Public read OS Hub screenshots"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'os-screenshots');
create policy "Project owners upload screenshots"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'os-screenshots'
    and exists (
      select 1 from public.os_projects p
      where p.id::text = (storage.foldername(name))[1]
        and p.owner_id = (select auth.uid())
    )
  );
create policy "Project owners update screenshots"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'os-screenshots'
    and exists (
      select 1 from public.os_projects p
      where p.id::text = (storage.foldername(name))[1]
        and p.owner_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'os-screenshots'
    and exists (
      select 1 from public.os_projects p
      where p.id::text = (storage.foldername(name))[1]
        and p.owner_id = (select auth.uid())
    )
  );
create policy "Project owners delete screenshots"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'os-screenshots'
    and exists (
      select 1 from public.os_projects p
      where p.id::text = (storage.foldername(name))[1]
        and p.owner_id = (select auth.uid())
    )
  );
