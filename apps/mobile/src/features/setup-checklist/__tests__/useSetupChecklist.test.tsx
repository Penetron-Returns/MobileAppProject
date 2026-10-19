import * as React from 'react';

import { flush, mount } from '@/testing/render';

import {
  useSetupChecklist,
  type SetupChecklistView,
} from '../useSetupChecklist';

type Q = { data?: unknown; isError?: boolean };
let mockQ: Record<string, Q>;
jest.mock('@/features/business/hooks', () => ({
  useBusinessDetails: () => mockQ.details,
  useBusinessHours: () => mockQ.hours,
}));
jest.mock('@/features/business/me', () => ({
  useMe: () => ({ data: { role: 'owner', business: { id: 'b1' } } }),
}));
jest.mock('@/features/catalog/hooks', () => ({
  useServices: () => mockQ.services,
  useStaff: () => mockQ.staff,
}));
jest.mock('@/features/companion/hooks', () => ({
  useCompanionSetup: () => mockQ.companion,
}));
jest.mock('@/features/notifications/pushDevice', () => ({
  getPushPermission: () => Promise.resolve('granted'),
}));
jest.mock('@/features/voice/hooks', () => ({ useHeyClovieOn: () => false }));
jest.mock('../reviewedStore', () => ({
  useReviewed: () => ({ reviewed: new Set(), markReviewed: jest.fn() }),
}));

function Probe({ onView }: { onView: (v: SetupChecklistView) => void }) {
  onView(useSetupChecklist());
  return null;
}

async function view(): Promise<SetupChecklistView> {
  let latest!: SetupChecklistView;
  mount(<Probe onView={(v) => (latest = v)} />);
  await flush();
  return latest;
}

const loaded = {
  details: { data: { phone: '1' } },
  hours: { data: [] },
  services: { data: [] },
  staff: { data: [] },
  companion: { data: { whatsapp: { connected: false } } },
};

describe('useSetupChecklist', () => {
  it('stays unready while a request is still loading', async () => {
    mockQ = { ...loaded, staff: {} };
    expect((await view()).isReady).toBe(false);
  });

  it.each(['details', 'hours', 'services', 'staff', 'companion'])(
    'counts a failed %s request as not done so Get set up still shows',
    async (key) => {
      mockQ = { ...loaded, [key]: { isError: true } };
      const v = await view();
      expect(v.isReady).toBe(true);
      expect(v.isComplete).toBe(false);
    },
  );
});
