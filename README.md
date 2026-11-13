# Atdev OS Hub

Plataforma comunitaria para descubrir, publicar y compartir sistemas operativos.

Atdev OS Hub permite explorar distribuciones comunitarias, publicar fichas de sistemas operativos y registrar versiones con enlaces de descarga y checksums SHA-256.

## Stack

- React + TypeScript + Vite
- Supabase Auth (GitHub y Google OAuth)
- Supabase Postgres con Row Level Security
- Supabase Storage para capturas de pantalla

## Desarrollo local

Requisitos: Node.js 20.19+ o 22.12+.

```sh
cp .env.example .env.local
npm install
npm run dev
```

La aplicación usa Vite en `http://127.0.0.1:4173`.

Configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en `.env.local`. La clave publishable es apta para el cliente; nunca coloques claves secretas ni `service_role` en el frontend.

## Supabase

El proyecto conectado es **Atdev OS Hub**. El esquema de base de datos se encuentra en `supabase/schema.sql`. Las tablas tienen RLS habilitado y políticas de acceso por propietario/publicación.

En Supabase:
1. Habilita el esquema `public` en Data API → Exposed schemas si no está habilitado.
2. En Authentication → URL Configuration, permite `http://127.0.0.1:4173/**` y `http://localhost:4173/**`.
3. Configura GitHub y Google en Authentication → Sign In / Providers.
4. Registra como callback OAuth la URL que muestra Supabase para el proyecto.

La aplicación no contiene secretos OAuth. Los Client Secret se guardan exclusivamente en la configuración de Auth de Supabase.

## Git platform and Void Memingo

Atdev OS Hub is planned as a Git client and repository administration interface for GitHub, GitLab and the experimental GitVoid provider. See [Git platform architecture](docs/GIT_PLATFORM.md) and [Void Memingo integration](docs/VOID_MEMINGO_INTEGRATION.md). Provider OAuth tokens are stored in Supabase Vault and accessed only by trusted server-side functions. GitVoid remains experimental until its protocol/API is complete.

Void Memingo OS Builder projects (starting with PondOS) will publish manifests, build provenance and release metadata to OS Hub. The database foundation is in place; OAuth callbacks, provider API adapters, Edge Functions and the desktop sync client are still required before end-to-end operation.

## Git Center

Git Center connects GitHub and GitLab accounts separately from OS Hub sign-in, imports repositories, and browses branches and commit history. Provider OAuth setup is documented in [Git provider setup](docs/GIT_PROVIDER_SETUP.md). GitVoid is experimental. The first UI milestone is read-only; repository writes require separately configured least-privilege permissions and confirmation flows. Git Center also manages scoped, one-time-display API tokens for Void Memingo.

## GitHub Actions

El workflow de CI instala dependencias, ejecuta TypeScript y construye la aplicación. No necesita credenciales Supabase para compilar.

## Seguridad y alcance actual

- RLS habilitado en perfiles, proyectos, versiones, capturas, estrellas y comentarios.
- ISO y otros artefactos grandes se alojan en servicios de releases externos; Supabase guarda metadatos y checksums.
- El checksum SHA-256 enviado por el publicador es metadato declarado; la verificación del archivo descargado en servidor está pendiente.
- Las funciones de OAuth requieren que el administrador configure sus credenciales de proveedor en Supabase.

## Licencia

Consulta [LICENSE](LICENSE).
