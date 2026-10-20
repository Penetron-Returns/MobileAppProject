import {
  authErrorKey,
  clerkErrorCode,
  isAlreadySignedIn,
  isUnknownIdentifier,
} from '../errors';

const apiError = (code: string) => ({ errors: [{ code, message: 'x' }] });

describe('authErrorKey', () => {
  it.each([
    ['form_param_format_invalid', 'emailInvalid'],
    ['form_code_incorrect', 'codeIncorrect'],
    ['verification_expired', 'codeExpired'],
    ['too_many_requests', 'tooManyAttempts'],
    ['captcha_invalid', 'botCheck'],
    ['user_locked', 'accountLocked'],
    ['not_allowed_access', 'notAllowed'],
    ['network_error', 'network'],
    ['something_new', 'generic'],
  ])('%s -> %s', (code, key) => {
    expect(authErrorKey(apiError(code))).toBe(key);
    expect(authErrorKey({ code })).toBe(key);
  });

  it('treats a failed fetch as a network problem', () => {
    expect(authErrorKey(new TypeError('Network request failed'))).toBe(
      'network',
    );
  });

  it('falls back to generic for empty input', () => {
    expect(authErrorKey(null)).toBe('generic');
    expect(authErrorKey(undefined)).toBe('generic');
    expect(authErrorKey('boom')).toBe('generic');
  });
});

it('reads the code from the first API error before the top-level code', () => {
  expect(clerkErrorCode({ code: 'a', errors: [{ code: 'b' }] })).toBe('b');
  expect(clerkErrorCode({ code: 'a', errors: [] })).toBe('a');
});

it('detects an unknown account', () => {
  expect(isUnknownIdentifier(apiError('form_identifier_not_found'))).toBe(true);
  expect(isUnknownIdentifier(apiError('form_code_incorrect'))).toBe(false);
});

it('detects an existing session', () => {
  expect(isAlreadySignedIn(apiError('session_exists'))).toBe(true);
  expect(isAlreadySignedIn(apiError('identifier_already_signed_in'))).toBe(
    true,
  );
  expect(isAlreadySignedIn(apiError('form_code_incorrect'))).toBe(false);
});
