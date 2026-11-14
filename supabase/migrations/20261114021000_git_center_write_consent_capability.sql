alter table public.git_provider_connections
  add column if not exists write_access boolean not null default false;

alter table private.git_oauth_states
  add column if not exists write_access boolean not null default false;

drop function if exists public.git_create_oauth_state(text,uuid,text,text,text);
create function public.git_create_oauth_state(
  p_state_id text,
  p_owner_id uuid,
  p_provider text,
  p_return_origin text,
  p_code_verifier text default null,
  p_write_access boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_provider not in ('github','gitlab')
    or length(p_state_id) < 32
    or length(p_state_id) > 128
    or p_return_origin !~ '^https?://' then
    raise exception 'Invalid OAuth state parameters';
  end if;
  insert into private.git_oauth_states(state_id,owner_id,provider,return_origin,code_verifier,write_access,expires_at)
  values(p_state_id,p_owner_id,p_provider,p_return_origin,p_code_verifier,p_write_access,now()+interval '10 minutes');
end;
$$;

drop function if exists public.git_consume_oauth_state(text);
create function public.git_consume_oauth_state(p_state_id text)
returns table(owner_id uuid,provider text,return_origin text,code_verifier text,write_access boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query delete from private.git_oauth_states s
  where s.state_id=p_state_id and s.expires_at>now()
  returning s.owner_id,s.provider,s.return_origin,s.code_verifier,s.write_access;
end;
$$;

revoke all on function public.git_create_oauth_state(text,uuid,text,text,text,boolean) from public,anon,authenticated;
revoke all on function public.git_consume_oauth_state(text) from public,anon,authenticated;
grant execute on function public.git_create_oauth_state(text,uuid,text,text,text,boolean) to service_role;
grant execute on function public.git_consume_oauth_state(text) to service_role;
comment on column public.git_provider_connections.write_access is
  'Explicit Git Center write consent captured during OAuth. Provider API permissions remain authoritative.';
