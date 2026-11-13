# Git provider setup

Git Center is deployed, but external provider OAuth credentials must be configured before users can connect accounts.

## Supabase Edge Function secrets

Open Supabase Dashboard → Edge Functions → Secrets for project `pzfvpvioxpcjkxdawnsq` and add:

- `OAUTH_STATE_SECRET`: a newly generated random secret with at least 32 random bytes.
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

For the initial Git Center milestone, request only:
- Repository metadata: read-only
- Contents: read-only
- Pull requests: read-only (optional)

Install the App only on repositories the account holder wants OS Hub to access, then add its client ID and client secret to Supabase Edge Function Secrets. User access tokens are limited by both the app's permissions and the user's own access.

The current backend supports repository listing/sync, branches, commits and tree browsing. The UI intentionally remains read-only until write permissions and explicit confirmation UX are added.

## GitLab OAuth application

Create an OAuth application on GitLab.com with redirect URI:

```text
https://pzfvpvioxpcjkxdawnsq.supabase.co/functions/v1/git-oauth-callback
```

Enable the authorization code flow and PKCE. Initial requested scopes are:
- `read_user`
- `read_api`
- `read_repository`

Add the application ID and secret to Supabase Edge Function Secrets.

## Atdev OS Hub identity vs Git provider connection

The existing “Sign in with GitHub” button authenticates a user account in Supabase Auth. Git Center's separate “Connect” button authorizes repository access. These are intentionally independent permissions.

## Callback and endpoints

- Git provider callback: `/functions/v1/git-oauth-callback`
- Authenticated Git API: `/functions/v1/git-provider`

The callback validates a signed, short-lived OAuth state. GitLab authorization uses PKCE. Provider access/refresh tokens are stored in Supabase Vault and are never returned to the browser.

## GitVoid

GitVoid remains experimental until its Git transport, repository API, authentication, authorization and hosting service are implemented. It is shown as a future provider, not as a working remote.
