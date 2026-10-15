/** What a person types on the Join screen when Clerk has no name for them yet. */
export interface NameInput {
  firstName: string;
  lastName: string;
}

export type NameResult =
  { ok: true; name: NameInput } | { ok: false; error: 'firstNameRequired' };

/** True when the Clerk user has no first name, so the Join screen has to ask for one. */
export function needsName(firstName: string | null | undefined): boolean {
  return !firstName?.trim();
}

/**
 * Trims both parts and requires a first name. The last name is optional:
 * single-name people exist, and the API only needs something better than the
 * email address to show on the team list.
 */
export function validateName(input: NameInput): NameResult {
  const firstName = input.firstName.trim().replace(/\s+/g, ' ');
  const lastName = input.lastName.trim().replace(/\s+/g, ' ');
  if (!firstName) return { ok: false, error: 'firstNameRequired' };
  return { ok: true, name: { firstName, lastName } };
}
