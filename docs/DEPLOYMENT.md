# Deploy Atdev OS Hub

Atdev OS Hub is a static React + TypeScript + Vite application. Cloudflare Pages serves the frontend; Supabase provides Auth, Postgres, Storage and Edge Functions.

## Cloudflare Pages project

Create a Pages project in the Cloudflare dashboard and connect the GitHub repository `Reaccionador2Jeje/Atdev-OS-Hub`.

Use these exact build settings:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Framework preset | `Vite` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` |
| Node.js | `22` |

No Cloudflare API token or Wrangler configuration is required for the Git-integrated Pages deployment.

## Build environment variables

Add these variables under Pages → Settings → Environment variables. Configure them for both Production and Preview if preview deployments should connect to the same Supabase project.

- `VITE_SUPABASE_URL=https://pzfvpvioxpcjkxdawnsq.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY=<Supabase publishable key>`

Use the publishable key from Supabase Project Settings → API Keys. It is designed for browser use and is not a secret. Never use a Supabase secret key or `service_role` key in a `VITE_*` variable, frontend code, or Git.

The repository's `.env.example` is a local-development template. Cloudflare Pages environment variables must be configured in the Pages dashboard separately.

## Included Pages routing and security files

The repository contains:

- `public/_redirects`: sends unknown paths to `index.html` with a 200 response, so client-side routes can load directly.
- `public/_headers`: adds baseline browser security headers and long-lived caching for Vite's fingerprinted assets.

Vite copies the `public/` directory into `dist/` during the production build. Do not place these files at the repository root.

## Supabase Auth after deployment

After the first successful deployment, copy the exact HTTPS origin assigned by Cloudflare Pages (or the final custom domain).

In Supabase Dashboard → Authentication → URL Configuration:

1. Set Site URL to the production HTTPS origin.
2. Add the production origin and required redirect paths to Redirect URLs.
3. Keep local development entries `http://127.0.0.1:4173/**` and `http://localhost:4173/**`.
4. Configure GitHub and Google sign-in providers using [OAuth setup](OAUTH_SETUP.md).

The website calls `signInWithOAuth` with the current website origin as `redirectTo`, so that origin must be allowed. If Preview deployments use authentication, add only the preview URL patterns you intentionally trust; do not broadly allow arbitrary domains.

## Git Center callback allowlist

Add the exact production website origin to Supabase Edge Function Secret `APP_ALLOWED_ORIGINS`, along with the local development origins. Example:

```text
http://127.0.0.1:4173,http://localhost:4173,https://YOUR-PROJECT.pages.dev
```

Replace the example with the actual deployed origin. Do not include a trailing slash. Add a custom domain only after it has been attached to Pages.

## Supabase and OAuth prerequisites

Before considering the production site fully operational:

- Confirm the required Supabase migrations have been applied to the intended project.
- Confirm the `public` schema is exposed through Supabase Data API and the expected grants/RLS policies are active.
- Configure GitHub and Google sign-in credentials in Supabase Auth if those sign-in buttons are to be used.
- Configure GitHub/GitLab Git Center OAuth credentials as Supabase Edge Function Secrets. These are separate from Supabase Auth credentials.
- Confirm the deployed website origin is allowed by Supabase Auth and `APP_ALLOWED_ORIGINS`.

Never put OAuth client secrets, provider access tokens, Supabase secret keys or service-role keys in Git, `.env.local`, browser code, Cloudflare `VITE_*` variables or chat.

## Verify deployment

After Cloudflare reports a successful deployment:

1. Open the Pages URL over HTTPS and refresh the homepage.
2. Open a deep link or unknown path directly; it should return the SPA rather than a Pages 404.
3. Confirm the catalog loads from Supabase.
4. Test GitHub/Google sign-in only after configuring their Supabase Auth providers and redirect allowlists.
5. Open Git Center and confirm configuration errors are reported clearly when a Git provider's OAuth secrets are not configured.
6. Use a dedicated test account to publish a test OS project, open its details, favorite it and add a comment.
7. Verify that the test release metadata and download link are displayed as expected.

Do not test production writes with real project data until the schema, RLS policies and OAuth settings have been reviewed.

A green frontend build does not prove that Supabase authentication, database policies, Edge Function secrets or provider OAuth are configured. Production is complete only after those runtime checks pass.
