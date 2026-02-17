## Job Hopper

This project uses Supabase as its primary database.

### Supabase types

- Generated database types live in `src/types/supabase.ts` as the `Database` type.
- These types are generated from the Supabase schema and should **never be edited by hand**.

To regenerate the types after changing the database schema or migrations, run:

```bash
npm run db:types
```

This command calls:

```bash
supabase gen types typescript --schema public > src/types/supabase.ts
```

Make sure to commit any changes to `src/types/supabase.ts` when you update the schema.

### Pre-commit hook for Supabase types

This repository includes an pre-commit hook script at `.githooks/pre-commit-supabase-types` that helps keep `src/types/supabase.ts` in sync with the database schema.

To enable it locally, point Git at the `.githooks` directory:

```bash
git config core.hooksPath .githooks
```

After that, each commit will:

- Regenerate Supabase types using the same command as `npm run db:types`.
- Fail the commit if `src/types/supabase.ts` changes and is not yet staged, prompting you to add it.


