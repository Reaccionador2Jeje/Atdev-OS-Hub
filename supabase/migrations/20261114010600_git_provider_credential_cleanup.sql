create or replace function public.git_delete_provider_credential(p_connection_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_access_id uuid;
  v_refresh_id uuid;
begin
  select access_token_secret_id, refresh_token_secret_id
    into v_access_id, v_refresh_id
  from private.git_provider_credentials
  where connection_id = p_connection_id;

  delete from private.git_provider_credentials
  where connection_id = p_connection_id;

  if v_access_id is not null then
    delete from vault.secrets where id = v_access_id;
  end if;
  if v_refresh_id is not null and v_refresh_id is distinct from v_access_id then
    delete from vault.secrets where id = v_refresh_id;
  end if;
end;
$$;

revoke all on function public.git_delete_provider_credential(uuid) from public, anon, authenticated;
grant execute on function public.git_delete_provider_credential(uuid) to service_role;
comment on function public.git_delete_provider_credential(uuid) is
  'Deletes stored provider credentials and their Vault secrets for a disconnected Git provider connection. Service-role only.';
