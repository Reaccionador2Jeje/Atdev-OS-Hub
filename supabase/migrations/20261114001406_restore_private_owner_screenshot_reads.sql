drop policy if exists "Read screenshots for public projects" on public.os_screenshots;

create policy "Read public or owned screenshots"
  on public.os_screenshots for select to anon, authenticated
  using (exists (
    select 1 from public.os_projects p
    where p.id = project_id
      and (
        (p.visibility = 'public' and p.status = 'published')
        or p.owner_id = (select auth.uid())
      )
  ));
