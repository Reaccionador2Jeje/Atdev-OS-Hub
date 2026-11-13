create table if not exists public.os_hub_api_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (char_length(label) between 2 and 80),
  token_prefix text not null,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  scopes text[] not null default '{}',
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists os_hub_api_tokens_owner_idx on public.os_hub_api_tokens(owner_id, created_at desc);
alter table public.os_hub_api_tokens enable row level security;
create policy "Users view their own OS Hub API tokens" on public.os_hub_api_tokens for select to authenticated using (owner_id = (select auth.uid()));
create policy "Users create their own OS Hub API tokens" on public.os_hub_api_tokens for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "Users revoke their own OS Hub API tokens" on public.os_hub_api_tokens for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
grant select, insert, update on public.os_hub_api_tokens to authenticated;
grant select, insert, update on public.os_hub_api_tokens to service_role;
comment on table public.os_hub_api_tokens is 'Hashed personal access tokens for trusted external clients such as Void Memingo. Raw tokens are displayed once and never stored.';
