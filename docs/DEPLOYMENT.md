# Deploy Atdev OS Hub

The frontend is a static Vite application. Supabase remains the backend for Auth, Postgres, Storage and Edge Functions.

## Cloudflare Pages

1. In Cloudflare, create a Pages project and connect the GitHub repository `Reaccionador2Jeje/Atdev-OS-Hub`.
2. Production branch: `main`.
3. Framework preset: Vite (or custom).
4. Build command: `npm run build`.
5. Build output directory: `dist`.
6. Add these build environment variables:
   - `VITE_SUPABASE_URL=https://pzfvpvioxpcjkxdawnsq.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY=<project publishable key>`
7. Deploy, then attach the chosen custom domain in Cloudflare Pages.

The publishable key is intended for browser use. Never add a Supabase secret key or service-role key to Pages environment variables with a `VITE_` prefix.

## Supabase Auth after deployment

After the final website domain is known:

1. Open Supabase Dashboard → Authentication → URL Configuration.
2. Set Site URL to the exact HTTPS origin, for example `https://os-hub.example.com`.
3. Add that origin to Redirect URLs.
4. Keep local development entries `http://127.0.0.1:4173/**` and `http://localhost:4173/**`.
5. Configure GitHub and Google sign-in providers using [OAuth setup](OAUTH_SETUP.md).

## Git Center callback allowlist

Add the exact deployed website origin to Supabase Edge Function Secret `APP_ALLOWED_ORIGINS`, along with any local development origins. Example:

```text
http://127.0.0.1:4173,http://localhost:4173,https://os-hub.example.com
```

Replace the example domain with the real deployed origin. Do not include a trailing slash.

## Verify deployment

- Open the homepage and confirm the catalog loads.
- Sign in with GitHub or Google after the corresponding provider is enabled.
- Open Git Center and confirm missing provider secrets are reported as configuration issues, not silent failures.
- Publish a test OS project and verify it appears in the public catalogue.
- Open the project details, add a favorite and a comment, and verify releases are listed.
- Use a test project before connecting production OS Builder releases.

Deployment is not complete until the production domain, Supabase redirect allowlist, OAuth provider credentials and `APP_ALLOWED_ORIGINS` are all configured.
