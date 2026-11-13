create table if not exists private.git_oauth_states (
  state_id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('github','gitlab')),
  return_origin text not null,
  code_verifier text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table private.git_oauth_states enable row level security;
revoke all on private.git_oauth_states from public, anon, authenticated;
grant select, insert, update, delete on private.git_oauth_states to service_role;

create or replace function public.git_create_oauth_state(p_state_id text,p_owner_id uuid,p_provider text,p_return_origin text,p_code_verifier text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_provider not in ('github','gitlab') or length(p_state_id) < 32 or length(p_state_id) > 128 or p_return_origin !~ '^https?://' then
    raise exception 'Invalid OAuth state parameters';
  end if;
  insert into private.git_oauth_states(state_id,owner_id,provider,return_origin,code_verifier,expires_at)
  values(p_state_id,p_owner_id,p_provider,p_return_origin,p_code_verifier,now()+interval '10 minutes');
end;
$$;

create or replace function public.git_consume_oauth_state(p_state_id text)
returns table(owner_id uuid,provider text,return_origin text,code_verifier text)
language plpgsql security definer set search_path = '' as $$
begin
  return query delete from private.git_oauth_states s
  where s.state_id=p_state_id and s.expires_at>now()
  returning s.owner_id,s.provider,s.return_origin,s.code_verifier;
end;
$$;
revoke all on function public.git_create_oauth_state(text,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.git_consume_oauth_state(text) from public,anon,authenticated;
grant execute on function public.git_create_oauth_state(text,uuid,text,text,text) to service_role;
grant execute on function public.git_consume_oauth_state(text) to service_role;
comment on table private.git_oauth_states is 'One-time, short-lived OAuth state and PKCE verifier storage. Private to trusted Edge Functions.';
