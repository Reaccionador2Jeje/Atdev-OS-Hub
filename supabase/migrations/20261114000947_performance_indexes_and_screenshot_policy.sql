-- Improve foreign-key lookup performance and avoid overlapping screenshot SELECT policies.
create index if not exists git_oauth_states_owner_id_idx
  on private.git_oauth_states (owner_id);
create index if not exists git_provider_credentials_access_token_secret_id_idx
  on private.git_provider_credentials (access_token_secret_id);
create index if not exists git_provider_credentials_refresh_token_secret_id_idx
  on private.git_provider_credentials (refresh_token_secret_id);
create index if not exists os_builds_integration_id_idx
  on public.os_builds (integration_id);
create index if not exists os_builds_owner_id_idx
  on public.os_builds (owner_id);
create index if not exists os_builds_repository_id_idx
  on public.os_builds (repository_id);
create index if not exists os_comments_author_id_idx
  on public.os_comments (author_id);
create index if not exists os_project_git_links_owner_id_idx
  on public.os_project_git_links (owner_id);
create index if not exists os_project_git_links_repository_owner_idx
  on public.os_project_git_links (repository_id, owner_id);
create index if not exists os_stars_user_id_idx
  on public.os_stars (user_id);

drop policy if exists "Project owners manage screenshots" on public.os_screenshots;

create policy "Project owners upload screenshots"
  on public.os_screenshots for insert to authenticated
  with check (exists (
    select 1 from public.os_projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  ));

create policy "Project owners update screenshots"
  on public.os_screenshots for update to authenticated
  using (exists (
    select 1 from public.os_projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.os_projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  ));

create policy "Project owners delete screenshots"
  on public.os_screenshots for delete to authenticated
  using (exists (
    select 1 from public.os_projects p
    where p.id = project_id and p.owner_id = (select auth.uid())
  ));
