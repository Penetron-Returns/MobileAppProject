/**
 * Maps Clerk error codes to our copy (keys under `auth.errors`). Clerk keeps
 * doing the security work (codes, rate limits, bot protection); this only
 * decides what the user reads. Unknown codes fall back to a generic message.
 */
export type AuthErrorKey =
  | 'emailInvalid'
  | 'codeIncorrect'
  | 'codeExpired'
  | 'tooManyAttempts'
  | 'network'
  | 'botCheck'
  | 'accountLocked'
  | 'notAllowed'
  | 'signUpIncomplete'
  | 'secondFactorUnsupported'
  | 'generic';

const BY_CODE: Record<string, AuthErrorKey> = {
  form_param_format_invalid: 'emailInvalid',
  form_param_nil: 'emailInvalid',
  form_identifier_invalid: 'emailInvalid',
  form_code_incorrect: 'codeIncorrect',
  form_param_value_invalid: 'codeIncorrect',
  verification_failed: 'codeIncorrect',
  verification_expired: 'codeExpired',
  verification_already_verified: 'codeExpired',
  too_many_requests: 'tooManyAttempts',
  rate_limit_exceeded: 'tooManyAttempts',
  network_error: 'network',
  captcha_invalid: 'botCheck',
  captcha_unavailable: 'botCheck',
  captcha_failed: 'botCheck',
  requires_captcha: 'botCheck',
  bot_traffic_detected: 'botCheck',
  user_locked: 'accountLocked',
  not_allowed_access: 'notAllowed',
  not_allowed_to_sign_up: 'notAllowed',
  sign_up_mode_restricted: 'notAllowed',
  sign_up_restricted_waitlist: 'notAllowed',
  identifier_not_allowed: 'notAllowed',
};

/** The Clerk error code, from a ClerkError, an API error list or a bare code. */
export function clerkErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const e = error as {
    code?: unknown;
    errors?: readonly { code?: unknown }[];
  };
  const first = e.errors?.[0]?.code;
  if (typeof first === 'string') return first;
  return typeof e.code === 'string' ? e.code : null;
}

export function authErrorKey(error: unknown): AuthErrorKey {
  const code = clerkErrorCode(error);
  if (code && BY_CODE[code]) return BY_CODE[code];
  if (error instanceof TypeError) return 'network';
  return 'generic';
}

/** The sign-in attempt found no account for this email, so sign up instead. */
export const isUnknownIdentifier = (error: unknown) =>
  clerkErrorCode(error) === 'form_identifier_not_found';

/** The session already exists (double tap, resumed attempt): treat as success. */
export const isAlreadySignedIn = (error: unknown) => {
  const code = clerkErrorCode(error);
  return code === 'session_exists' || code === 'identifier_already_signed_in';
};
