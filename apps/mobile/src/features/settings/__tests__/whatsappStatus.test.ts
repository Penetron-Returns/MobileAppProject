import type { CompanionSetupDTO } from '@booking/types';

import { goLiveSteps, verificationPill, whatsAppPill } from '../whatsappStatus';

const base: CompanionSetupDTO = {
  next_step: 'connect_whatsapp',
  whatsapp: {
    connected: false,
    state: 'not_connected',
    display_phone_number: null,
    business_verified: false,
    business_verification_status: null,
  },
  provisioned: true,
  booking_connection: 'verified',
  blocking_reasons: [],
  companion_live: false,
};
const withWa = (
  w: Partial<CompanionSetupDTO['whatsapp']>,
): CompanionSetupDTO => ({
  ...base,
  whatsapp: { ...base.whatsapp, ...w },
});

describe('goLiveSteps', () => {
  it('lists connect then go live when nothing is connected', () => {
    expect(goLiveSteps(base)).toEqual(['connect', 'goLive']);
  });
  it('lists only go live once connected but not live', () => {
    expect(goLiveSteps(withWa({ connected: true }))).toEqual(['goLive']);
  });
  it('lists nothing when live', () => {
    expect(
      goLiveSteps({ ...withWa({ connected: true }), companion_live: true }),
    ).toEqual([]);
  });
});

describe('pills', () => {
  it('maps the WhatsApp state', () => {
    expect(whatsAppPill(base)).toBe('not_connected');
    expect(whatsAppPill(withWa({ state: 'awaiting_meta' }))).toBe('pending');
    expect(whatsAppPill(withWa({ connected: true, state: 'connected' }))).toBe(
      'connected',
    );
  });
  it('maps business verification', () => {
    expect(verificationPill(base.whatsapp)).toBe('not_verified');
    expect(
      verificationPill({
        ...base.whatsapp,
        business_verification_status: 'Pending_Review',
      }),
    ).toBe('pending');
    expect(
      verificationPill({ ...base.whatsapp, business_verified: true }),
    ).toBe('verified');
  });
});
