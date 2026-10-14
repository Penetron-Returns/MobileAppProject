---
paths: apps/mobile/src/features/**/components/*Form*.tsx,apps/mobile/src/features/**/*schema*.ts,packages/ui/src/components/FormField.tsx,packages/ui/src/components/GroupField.tsx
description: Rules for forms with react-hook-form, zod validation and API error mapping
---

# Forms With Validation

Forms use react-hook-form with zod schemas that mirror the API request types in `packages/shared/api.ts`, rendered with `FormField` and the UI primitives.

## Implementation

1. Define a zod schema per form next to the feature, typed against the `packages/shared/api.ts` request (`satisfies z.ZodType<CreateServiceRequest>`).
2. Use `react-hook-form` with `zodResolver` and render each field through `FormField` (label, control, error).
3. Pick values from structured controls (select, date, live slot list). Never ask for free-typed times, IDs or prices in the wrong unit. Convert currency input to cents in one helper.
4. Map `VALIDATION_FAILED` `details.issues` back onto fields, and show other API errors in a banner with the `request_id`.
5. Disable submit while pending, and reuse the same `Idempotency-Key` if the user retries.

## Examples

```tsx
// ✅ DO
<FormField control={form.control} name="duration_minutes" label={t('services.duration')} render={(field) => <Select {...field} options={DURATIONS} />} />

// ❌ DON'T
<TextInput onChangeText={(t) => setDuration(parseInt(t))} />
```
