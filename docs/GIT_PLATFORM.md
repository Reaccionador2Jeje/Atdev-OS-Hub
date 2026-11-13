# Git platform in Atdev OS Hub

Atdev OS Hub is both an operating-system project catalogue and a Git client/administration interface. Provider integrations use adapters behind a common capability model.

## Providers

| Provider | Target capability | Current state |
|---|---|---|
| GitHub | Repository import, files, branches, commits, branch creation and file commits | OAuth credentials required; browser UI currently exposes read-only browsing |
| GitLab | Repository import, files, branches, commits, branch creation and file commits | OAuth credentials required; GitLab adapter implemented, browser UI currently exposes read-only browsing |
| GitVoid | Native Atdev Git hosting and repository administration | Experimental; protocol/API is not complete |

Supabase GitHub/Google sign-in authenticates an OS Hub identity only. It does not authorize Git operations. GitHub repository access should use a GitHub App with minimum repository permissions. GitLab should use scopes selected for exact operations, beginning read-only and adding write access only when users enable it.

## Security model

- Browser code never receives provider access or refresh tokens.
- OAuth exchange and provider API calls happen in Supabase Edge Functions.
- OAuth tokens are stored as encrypted Supabase Vault secrets. The private.git_provider_credentials table stores only Vault secret IDs and is unavailable to anon/authenticated.
- Public tables contain provider identity, repository metadata, ownership and capability metadata only.
- RLS scopes connections and imported repositories to their owner. Project links require ownership of both the OS project and repository.
- Push, branch deletion, repository settings and release creation require explicit user action and provider permission checks.
- Start with read-only repository browsing; enable write operations per repository after credentials and scopes are configured.

## Void Memingo integration

A Void Memingo OS Builder project can be linked to an OS Hub project. The integration records the external project ID and sync state. Build records capture version, source commit, build status, artifact URL, SHA-256 and build metadata. The desktop app will submit a manifest and build event to authenticated Edge Functions; OS Hub validates ownership and publishes release metadata. Large ISO artifacts remain on GitHub Releases or another artifact host, not in Postgres.

Suggested flow:
1. User signs into OS Hub from Void Memingo.
2. User selects an existing OS Hub project or creates one.
3. User links the source repository through GitHub/GitLab.
4. Void Memingo submits the normalized OS manifest.
5. A completed build submits artifact URL, SHA-256, version and source commit.
6. OS Hub records provenance and publishes the release only after validation.

PondOS is the first example project for this flow. It remains in Void Memingo's examples/pondos/ directory and is linked to its OS Hub project, rather than copied as a disconnected project.

## Database

The additive migration is supabase/migrations/20261113000000_git_provider_and_void_memingo_integration.sql. It creates provider connections, imported repositories, OS project links, Void Memingo integration records and build provenance. The GitLab OAuth callback and provider API adapter are implemented in Supabase Edge Functions. GitLab OAuth client credentials still need to be registered and configured by the project owner.
