drop policy if exists "Users view their own OS Hub API tokens" on public.os_hub_api_tokens;
drop policy if exists "Users create their own OS Hub API tokens" on public.os_hub_api_tokens;
drop policy if exists "Users revoke their own OS Hub API tokens" on public.os_hub_api_tokens;
revoke all on public.os_hub_api_tokens from public, anon, authenticated;
grant select, insert, update on public.os_hub_api_tokens to service_role;
