## Architecture Decisions

### Supabase client

- `supabase` (from `src/lib/supabase.ts`) is **only** used in API helpers under `src/lib/`
- **Views, stores, and composables never import `supabase` directly**. They call the API API helpers under `src/lib/` instead.

### Database (schema & types)

- For database schema, types, see docs: `docs/db-schema-summary.md`.
- For how AI should use them, see Cursor rule: `.cursor/rules/db-schema.mdc`.
- **User-editable subsets**: When an API or form should only allow updating a subset of columns (e.g. to avoid letting callers change `role`, `organization_id`, or other sensitive fields), define a narrowed type in `src/types/database.ts`—e.g. `ProfileUserEditable` as `Pick<ProfileUpdate, ...>`—and use that for the public API. This keeps the allowed-field set in one place and documents the boundary next to the other profile types.