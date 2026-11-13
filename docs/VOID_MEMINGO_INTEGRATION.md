# Void Memingo ↔ Atdev OS Hub

## Goal

Atdev OS Hub is the public home for projects and releases produced by Void Memingo, while Void Memingo remains the desktop IDE and OS Builder.

## Contract

Void Memingo sends a versioned project manifest containing:
- stable external project ID
- name, slug, summary and description
- base distribution and release
- desktop environments and architectures
- source repository provider and canonical URL
- project version and build configuration

A build event contains:
- external project ID and version
- source commit SHA when source is a Git repository
- build status and timestamps
- artifact HTTPS URL
- SHA-256 checksum
- builder version and non-secret build metadata

Never send local filesystem paths, provider tokens, OAuth secrets, Supabase service-role keys or private environment variables.

## Ownership and authentication

The user authenticates through Supabase Auth in the desktop client. Edge Functions validate the user's JWT and project ownership before accepting sync or build events. A project cannot be linked or overwritten by a different account. Retries must be idempotent by external project ID and version.

## First milestone

1. Link PondOS from examples/pondos/ to an OS Hub project.
2. Publish project metadata from Void Memingo.
3. Record build provenance and release metadata.
4. Keep ISO artifacts on the configured release host.
5. Show sync status and latest published version in both applications.

Project publishing is implemented through the authenticated `void-memingo-sync` Edge Function. Git Center can issue scoped, one-year personal access tokens; raw tokens are displayed once and only SHA-256 hashes are stored. Void Memingo's OS Builder includes **Publicar en OS Hub** for manifest publishing and **Registrar build** for manual build-provenance events. Automatic build-completion callbacks and release promotion remain follow-up work.
