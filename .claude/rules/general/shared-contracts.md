---
paths: shared/**
description: Rules for the types-only contracts shared by app and backend
---

# Shared Contracts

`shared/` is imported by both the Expo app and the backend, which don't share `node_modules`. It must therefore stay free of runtime code.

## Implementation

1. Keep `shared/` types-only: no values, no zod, no imports other than `import type`.
2. Change [api.ts](/shared/api.ts) additively where possible. Update the backend schemas, the app usage and [BUILD_PLAN.md](/docs/BUILD_PLAN.md) §4 in the same PR.
3. Never edit [database.types.ts](/shared/database.types.ts) by hand. Change a migration and run `scripts/db/gen-types.sh` (the Edit hook blocks manual edits).

## Examples

```typescript
// ✅ DO
export interface SlotDTO { starts_at: ISODateTime; ends_at: ISODateTime; staff_ids: UUID[] }

// ❌ DON'T
import { z } from 'zod';
export const SlotSchema = z.object({ … });
```
