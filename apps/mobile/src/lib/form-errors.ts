import { isApiError } from './api';

export interface FieldError {
  field: string;
  message: string;
}

/**
 * Field-level problems from a `VALIDATION_FAILED` API error: zod `issues`
 * ({ path, message }) or a single `field`. Empty for any other error.
 */
export function apiFieldErrors(error: unknown): FieldError[] {
  if (!isApiError(error) || error.code !== 'VALIDATION_FAILED') return [];
  const details = error.details ?? {};
  const issues = Array.isArray(details.issues) ? details.issues : [];
  const fromIssues = issues.flatMap((issue: unknown) => {
    if (typeof issue !== 'object' || issue === null) return [];
    const { path, message } = issue as { path?: unknown; message?: unknown };
    return typeof path === 'string' && path
      ? [
          {
            field: path.split('.')[0],
            message: typeof message === 'string' ? message : error.message,
          },
        ]
      : [];
  });
  if (fromIssues.length) return fromIssues;
  return typeof details.field === 'string'
    ? [{ field: details.field, message: error.message }]
    : [];
}

/**
 * Applies API field errors to a form. `fields` maps API field names to form
 * field names (e.g. `price_cents` → `price`). Returns true when any applied.
 */
export function applyApiFieldErrors<F extends string>(
  error: unknown,
  fields: Partial<Record<string, F>>,
  setError: (field: F, message: string) => void,
): boolean {
  let applied = false;
  for (const e of apiFieldErrors(error)) {
    const formField = fields[e.field];
    if (formField) {
      setError(formField, e.message);
      applied = true;
    }
  }
  return applied;
}
