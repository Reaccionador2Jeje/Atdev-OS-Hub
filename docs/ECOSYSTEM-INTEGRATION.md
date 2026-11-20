# Atdev OS Hub — Ecosystem Integration

Status: planning document; existing Supabase RLS policies remain essential security boundaries.

## Data and access boundaries
- Keep RLS enabled for every user-owned or publication-related table.
- Never expose service-role credentials in browser code.
- Use the publishable key only with correctly configured RLS.
- Validate uploaded image type and size; do not trust file extensions alone.
- Keep ownership checks in database policies, not only in frontend UI.

## Next tasks
1. Add SQL tests or documented checks for each RLS policy.
2. Test anonymous, authenticated owner and non-owner access paths.
3. Document storage bucket policies and upload limits.
4. Add migration rollback notes and local seed data for reproducible testing.