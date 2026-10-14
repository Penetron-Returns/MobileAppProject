# @booking/database

The Supabase project and the single source of truth for the schema.

```
packages/database/
  database.types.ts     GENERATED. Never edit by hand: run scripts/db/gen-types.sh
  supabase/             the folder the Supabase CLI expects under --workdir
    config.toml
    migrations/         append-only once merged
    tests/              SQL tests (scripts/db/test.sh)
    seed.sql            demo data, local only
    functions/api/      Edge Function entry stub: index.ts + deno.json import map + smoke test
```

The entry stub imports `apps/api/src/app.ts` by relative path. `deno.json` maps
`@booking/types` to `packages/types` and pins the npm versions (keep them equal to
`apps/api/package.json`).

## Using the Supabase CLI

The CLI needs the nested `supabase/` folder, so pass `--workdir`:

```bash
npx supabase --workdir packages/database start
npx supabase --workdir packages/database db reset
npx supabase --workdir packages/database functions serve api --env-file apps/api/.env
npx supabase --workdir packages/database link --project-ref <ref>
npx supabase --workdir packages/database db push
npx supabase --workdir packages/database functions deploy api
```

`link` state is stored per workdir (`packages/database/supabase/.temp/`, gitignored), so
re-link once after pulling this layout.

## Types

`database.types.ts` is exposed as `@booking/database` (tsconfig `paths`, and the
workspace package for tooling). `@booking/types` holds only the API DTOs and has no
dependency on it.

## Checks

```bash
scripts/db/test.sh        # throwaway Postgres 16: migrations, seed, SQL tests, types check
scripts/db/gen-types.sh   # regenerate database.types.ts after any migration change
```
