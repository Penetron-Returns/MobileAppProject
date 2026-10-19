import { cacheScopeKey, isPersistableKey } from '../queryPersist';
import { qk } from '../query';

describe('isPersistableKey', () => {
  it.each([
    [qk.me, true],
    [qk.business, true],
    [qk.services, true],
    [qk.staff, true],
    [qk.businessHours, true],
    [qk.plans, true],
    [qk.stories, true],
    [qk.attendance, true],
    [qk.dashboard('2026-10-18'), true],
    [qk.appointmentsRange('2026-10-18', '2026-10-19'), true],
    [qk.clientBook, true],
    [qk.availabilitySlots, false],
    [qk.availabilityDays, false],
    [qk.companionSetup, false],
    [qk.companionWhatsAppHealth, false],
    [qk.companionSettings, false],
    [qk.conversations, false],
    [qk.messages('c1'), false],
    [qk.planPreview('pro'), false],
    [qk.appointment('a1'), false],
    [qk.client('c1'), false],
    [qk.reportRows('a', 'b'), false],
  ])('%j -> %s', (key, expected) => {
    expect(isPersistableKey(key)).toBe(expected);
  });
});

describe('cacheScopeKey', () => {
  it('needs both a user and a business', () => {
    expect(cacheScopeKey('u', 'o')).toBe('u:o');
    expect(cacheScopeKey('u', null)).toBeNull();
    expect(cacheScopeKey(null, 'o')).toBeNull();
  });
});
