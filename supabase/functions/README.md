# Supabase Edge Functions

This directory contains Supabase Edge Functions (Deno functions) that can be deployed to Supabase.

## Structure

Each function should be in its own subdirectory:

```
functions/
  my-function/
    index.ts
```

## Development

To develop functions locally:

```bash
supabase functions serve
```

## Deployment

To deploy functions:

```bash
supabase functions deploy <function-name>
```

## Documentation

For more information, see the [Supabase Edge Functions documentation](https://supabase.com/docs/guides/functions).

