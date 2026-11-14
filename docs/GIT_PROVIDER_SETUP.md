# Git provider setup

Git Center is deployed, but external provider OAuth credentials must be configured before users can connect accounts.

## Supabase Edge Function secrets

Open Supabase Dashboard → Edge Functions → Secrets for project `pzfvpvioxpcjkxdawnsq` and add:

- `APP_ALLOWED_ORIGINS`: comma-separated exact origins allowed after OAuth, for example `http://127.0.0.1:4173,http://localhost:4173`. Add the real HTTPS OS Hub domain when deployed.
- `GITHUB_APP_CLIENT_ID`: GitHub App client ID.
- `GITHUB_APP_CLIENT_SECRET`: GitHub App client secret.
- `GITLAB_CLIENT_ID`: GitLab OAuth application ID.
- `GITLAB_CLIENT_SECRET`: GitLab OAuth application secret.

Never put these values in the repository, frontend environment, issue, or chat. Enter them directly in Supabase. The Edge Functions use the Supabase secret API key internally and store per-user provider tokens encrypted through Vault.

## GitHub App

Create a GitHub App (not the OS Hub GitHub sign-in OAuth App) and configure its user authorization callback URL to:

```text
https://pzfvpvioxpcjkxdawnsq.supabase.co/functions/v1/git-oauth-callback
```

Configure only the repository permissions required by the features:
- Metadata: read-only
- Contents: read and write
- Pull requests: read and write

Install the App only on repositories the account holder wants OS Hub to access, then add its client ID and client secret to Supabase Edge Function Secrets. User access tokens are limited by both the app's permissions and the user's own access.

The Git Center write-consent checkbox is off by default. The server records this choice in the one-time OAuth state and connection record. For GitHub Apps, this is an internal consent flag, not a `repo` scope; GitHub enforces the App's Contents and Pull requests permissions and the user's repository access on each API request. For GitLab, the write flow requests the `api` scope. Each remote write requires a separate confirmation. Reconnect existing accounts with write consent enabled to activate the capability.

## GitLab OAuth application

Create an OAuth application on GitLab.com with redirect URI:

```text
https://pzfvpvioxpcjkxdawnsq.supabase.co/functions/v1/git-oauth-callback
```

Enable the authorization code flow and PKCE. Initial read-only scopes are:
- `read_user`
- `read_api`
- `read_repository`

When a user explicitly enables write consent, Git Center requests the broader `api` scope for branch creation, file commits and merge requests. Add the application ID and secret to Supabase Edge Function Secrets.

## Atdev OS Hub identity vs Git provider connection

The existing “Sign in with GitHub” button authenticates a user account in Supabase Auth. Git Center's separate “Connect” button authorizes repository access. These are intentionally independent permissions.

## Callback and endpoints

- Git provider callback: `/functions/v1/git-oauth-callback`
- Authenticated Git API: `/functions/v1/git-provider`

The callback validates and consumes a random, one-time, ten-minute OAuth state stored server-side. GitLab authorization uses PKCE; its verifier is kept in the private database state record, never in the browser URL. Provider access/refresh tokens are stored in Supabase Vault and are never returned to the browser. Disconnecting a provider deletes the local Vault secrets and imported repository records; it does not revoke the grant at the external provider.

## GitVoid

GitVoid remains experimental until its Git transport, repository API, authentication, authorization and hosting service are implemented. It is shown as a future provider, not as a working remote.
