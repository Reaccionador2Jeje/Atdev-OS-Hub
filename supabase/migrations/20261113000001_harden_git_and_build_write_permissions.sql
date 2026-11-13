-- Restrict provider identity/repository synchronization and build provenance
-- writes to trusted server-side functions. Project owners retain control over
-- links and Void Memingo sync preferences for projects they own.

drop policy if exists "Users register their Git provider connections" on public.git_provider_connections;
drop policy if exists "Users update their Git provider connections" on public.git_provider_connections;
drop policy if exists "Users disconnect their Git provider connections" on public.git_provider_connections;
drop policy if exists "Users add their Git repositories" on public.git_repositories;
drop policy if exists "Users update their Git repositories" on public.git_repositories;
drop policy if exists "Users remove their Git repositories" on public.git_repositories;
drop policy if exists "Project owners update Git links" on public.os_project_git_links;
drop policy if exists "Project owners update Void Memingo integrations" on public.os_project_integrations;
drop policy if exists "Project owners register builds" on public.os_builds;
drop policy if exists "Project owners update build status" on public.os_builds;

create policy "Project owners update Git links" on public.os_project_git_links for update to authenticated
using (
 owner_id = (select auth.uid())
 and exists (select 1 from public.os_projects p where p.id = project_id and p.owner_id = (select auth.uid()))
 and exists (select 1 from public.git_repositories r where r.id = repository_id and r.owner_id = (select auth.uid()))
)
with check (
 owner_id = (select auth.uid())
 and exists (select 1 from public.os_projects p where p.id = project_id and p.owner_id = (select auth.uid()))
 and exists (select 1 from public.git_repositories r where r.id = repository_id and r.owner_id = (select auth.uid()))
);

create policy "Project owners update Void Memingo integrations" on public.os_project_integrations for update to authenticated
using (
 owner_id = (select auth.uid())
 and exists (select 1 from public.os_projects p where p.id = project_id and p.owner_id = (select auth.uid()))
)
with check (
 owner_id = (select auth.uid())
 and exists (select 1 from public.os_projects p where p.id = project_id and p.owner_id = (select auth.uid()))
);

revoke insert, update, delete on public.git_provider_connections from authenticated;
grant select on public.git_provider_connections to authenticated;
revoke insert, update, delete on public.git_repositories from authenticated;
grant select on public.git_repositories to authenticated;
revoke insert, update, delete on public.os_builds from authenticated;
grant select on public.os_builds to authenticated;
grant select, insert, update, delete on public.os_project_git_links, public.os_project_integrations to authenticated;
grant select, insert, update, delete on public.git_provider_connections, public.git_repositories, public.os_builds to service_role;
