create or replace function public.git_store_provider_credential(
  p_connection_id uuid, p_access_token text, p_refresh_token text default null, p_expires_at timestamptz default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_access_id uuid; v_refresh_id uuid;
begin
  if p_access_token is null or length(p_access_token) < 8 then raise exception 'Invalid provider access token'; end if;
  select access_token_secret_id, refresh_token_secret_id into v_access_id, v_refresh_id
  from private.git_provider_credentials where connection_id = p_connection_id;
  if v_access_id is null then
    select vault.create_secret(p_access_token, null, 'Atdev OS Hub Git provider access token') into v_access_id;
  else
    perform vault.update_secret(v_access_id, p_access_token);
  end if;
  if p_refresh_token is not null and length(p_refresh_token) > 0 then
    if v_refresh_id is null then
      select vault.create_secret(p_refresh_token, null, 'Atdev OS Hub Git provider refresh token') into v_refresh_id;
    else
      perform vault.update_secret(v_refresh_id, p_refresh_token);
    end if;
  end if;
  insert into private.git_provider_credentials(connection_id,access_token_secret_id,refresh_token_secret_id,access_token_expires_at,updated_at)
  values(p_connection_id,v_access_id,v_refresh_id,p_expires_at,now())
  on conflict(connection_id) do update set
    access_token_secret_id=excluded.access_token_secret_id,
    refresh_token_secret_id=coalesce(excluded.refresh_token_secret_id,private.git_provider_credentials.refresh_token_secret_id),
    access_token_expires_at=excluded.access_token_expires_at,updated_at=now();
end;
$$;

create or replace function public.git_get_provider_credential(p_connection_id uuid)
returns table(access_token text,refresh_token text,expires_at timestamptz)
language sql security definer set search_path = '' stable as $$
  select access_secret.decrypted_secret,refresh_secret.decrypted_secret,credentials.access_token_expires_at
  from private.git_provider_credentials credentials
  join vault.decrypted_secrets access_secret on access_secret.id=credentials.access_token_secret_id
  left join vault.decrypted_secrets refresh_secret on refresh_secret.id=credentials.refresh_token_secret_id
  where credentials.connection_id=p_connection_id limit 1;
$$;

revoke all on function public.git_store_provider_credential(uuid,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.git_get_provider_credential(uuid) from public,anon,authenticated;
grant execute on function public.git_store_provider_credential(uuid,text,text,timestamptz) to service_role;
grant execute on function public.git_get_provider_credential(uuid) to service_role;
comment on function public.git_store_provider_credential(uuid,text,text,timestamptz) is 'Stores Git provider tokens in Supabase Vault. Execute permission is limited to service_role.';
comment on function public.git_get_provider_credential(uuid) is 'Returns decrypted Git provider tokens to trusted server-side service_role functions only.';
