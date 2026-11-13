# OAuth configuration for Atdev OS Hub

Atdev OS Hub has two independent OAuth purposes. Do not reuse the same callback for both.

## 1. User sign-in (Supabase Auth)

These providers authenticate the person's Atdev OS Hub account. They do not grant Git repository access.

Supabase project: `pzfvpvioxpcjkxdawnsq`

Supabase Auth callback (use this callback in the external provider's OAuth client):

```text
https://pzfvpvioxpcjkxdawnsq.supabase.co/auth/v1/callback
```

### GitHub sign-in
1. Create a dedicated GitHub OAuth App named **Atdev OS Hub Login**.
2. Homepage URL: the deployed Atdev OS Hub website origin.
3. Authorization callback URL: the Supabase Auth callback above.
4. Copy its Client ID and Client Secret into Supabase Dashboard → Authentication → Sign In / Providers → GitHub.
5. Enable GitHub and save.

Use only identity scopes needed for sign-in (the Supabase GitHub provider handles the OAuth request).

### Google sign-in
1. Create an OAuth 2.0 Client ID of type **Web application** in Google Cloud Console.
2. Add the deployed site origin to Authorized JavaScript origins.
3. Add the Supabase Auth callback above to Authorized redirect URIs.
4. Copy the Client ID and Client Secret into Supabase Dashboard → Authentication → Sign In / Providers → Google.
5. Enable Google and save.

### Supabase URL Configuration
In Authentication → URL Configuration:
- Set Site URL to the final HTTPS website origin once deployed.
- Add `http://127.0.0.1:4173/**` and `http://localhost:4173/**` for local development.
- Add the deployed origin and its required redirect paths.

The website calls `signInWithOAuth` with the current website origin as `redirectTo`, so that exact origin must be allowed.

## 2. Git Center provider connections

Git Center's Connect buttons authorize repository API access. These are separate from Supabase Auth.

Callback URL for both provider integrations:

```text
https://pzfvpvioxpcjkxdawnsq.supabase.co/functions/v1/git-oauth-callback
```

### GitHub repository access
1. Create a separate GitHub App named **Atdev OS Hub Git Center** (do not reuse the login OAuth App).
2. Configure the user authorization callback URL to the Git Center callback above.
3. Start with repository metadata read-only and contents read-only. Add other permissions only when the corresponding feature is implemented.
4. Install the App only on repositories you want to connect.
5. Copy the App's Client ID and Client Secret into Supabase Edge Function Secrets as `GITHUB_APP_CLIENT_ID` and `GITHUB_APP_CLIENT_SECRET`.

The current Git Center UI is read-only. It can import repositories and inspect branches, commits and text files. It does not push commits or change repository settings.

### GitLab repository access
1. Create a separate GitLab OAuth application named **Atdev OS Hub Git Center**.
2. Redirect URI: the Git Center callback above.
3. Enable Authorization Code flow and PKCE.
4. Start with scopes `read_user`, `read_api` and `read_repository`.
5. Copy its Application ID and Secret into Supabase Edge Function Secrets as `GITLAB_CLIENT_ID` and `GITLAB_CLIENT_SECRET`.

### Edge Function secrets

In Supabase Dashboard → Edge Functions → Secrets, configure:

- `APP_ALLOWED_ORIGINS`: comma-separated exact website origins. Include local development origins and the deployed HTTPS origin, for example `http://127.0.0.1:4173,http://localhost:4173,https://YOUR-SITE-DOMAIN`.
- `GITHUB_APP_CLIENT_ID`
- `GITHUB_APP_CLIENT_SECRET`
- `GITLAB_CLIENT_ID`
- `GITLAB_CLIENT_SECRET`

Replace the example website origin with the actual deployed origin. Do not add a trailing slash.

Never put OAuth client secrets, provider access tokens, Supabase secret keys or service-role keys in Git, `.env.local`, browser code or chat. Enter them directly in the provider dashboards and Supabase secrets settings. Supabase Edge Functions can read production secrets without redeploying.

## Why these are separate

- Supabase Auth: who is signed into Atdev OS Hub.
- Git Center OAuth: which Git repositories that signed-in user authorizes OS Hub to inspect.
- Void Memingo personal access token: lets the user's desktop project publish OS metadata and build events.

A successful sign-in does not automatically connect the same Git provider account to Git Center.
