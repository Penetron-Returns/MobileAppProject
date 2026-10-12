import { ApiError } from '../api';
import { apiFieldErrors, applyApiFieldErrors } from '../form-errors';

function validationError(details: Record<string, unknown>) {
  return new ApiError({
    code: 'VALIDATION_FAILED',
    message: 'Invalid request body',
    status: 400,
    details,
  });
}

describe('apiFieldErrors', () => {
  it('reads zod issues, using the top-level path segment', () => {
    expect(
      apiFieldErrors(
        validationError({
          issues: [
            { path: 'price_cents', message: 'Too small' },
            { path: 'booking_rules.buffer_minutes', message: 'Invalid' },
            { path: '', message: 'Ignored' },
          ],
        }),
      ),
    ).toEqual([
      { field: 'price_cents', message: 'Too small' },
      { field: 'booking_rules', message: 'Invalid' },
    ]);
  });

  it('reads a single `field` detail (e.g. an invalid phone)', () => {
    expect(apiFieldErrors(validationError({ field: 'phone' }))).toEqual([
      { field: 'phone', message: 'Invalid request body' },
    ]);
  });

  it.each([
    [
      'another API error',
      new ApiError({ code: 'SLOT_UNAVAILABLE', message: 'x', status: 409 }),
    ],
    ['a plain error', new Error('boom')],
  ])('ignores %s', (_label, error) => {
    expect(apiFieldErrors(error)).toEqual([]);
  });
});

describe('applyApiFieldErrors', () => {
  it('maps API fields onto form fields and reports whether any applied', () => {
    const setError = jest.fn();
    const applied = applyApiFieldErrors(
      validationError({
        issues: [
          { path: 'price_cents', message: 'Too small' },
          { path: 'unknown', message: 'x' },
        ],
      }),
      { price_cents: 'price' },
      setError,
    );
    expect(applied).toBe(true);
    expect(setError).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalledWith('price', 'Too small');
  });

  it('applies nothing when no field matches', () => {
    expect(
      applyApiFieldErrors(
        validationError({ issues: [] }),
        { name: 'name' },
        jest.fn(),
      ),
    ).toBe(false);
  });
});
