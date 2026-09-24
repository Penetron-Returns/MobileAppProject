---
paths:
  - "shared/**"
---

# Shared contracts

- `shared/` is **types only**: no runtime imports, no values, no zod. Both the app and backend import it with `import type`.
- `shared/api.ts` changes must be additive where possible. Update the backend schemas and the app usage in the same PR, plus `docs/BUILD_PLAN.md` §4.
- `shared/database.types.ts` is generated. Change the migration and regenerate; never edit it by hand.
