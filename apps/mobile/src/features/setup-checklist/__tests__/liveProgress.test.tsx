import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';

import { act, mount } from '@/testing/render';

import { resetReviewedStore } from '../reviewedStore';
import { useSetupChecklist } from '../useSetupChecklist';
import { useSetupStory } from '../useSetupStory';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
}));
jest.mock('@/features/business/me', () => ({
  useMe: () => ({ data: { role: 'owner', business: { id: 'b1' } } }),
}));
let mockServices: unknown[] | undefined;
let mockStaff: unknown[] | undefined;
let mockHours: unknown[] | undefined;
let mockDetails: { phone: string | null; address: string | null } | undefined;
jest.mock('@/features/catalog/hooks', () => ({
  useServices: () => ({ data: mockServices }),
  useStaff: () => ({ data: mockStaff }),
}));
jest.mock('@/features/business/hooks', () => ({
  useBusinessHours: () => ({ data: mockHours }),
  useBusinessDetails: () => ({ data: mockDetails }),
}));
jest.mock('@/features/notifications/pushDevice', () => ({
  getPushPermission: () => Promise.resolve('denied'),
}));
let mockConnected = false;
jest.mock('@/features/companion/hooks', () => ({
  useCompanionSetup: () => ({
    data: { whatsapp: { connected: mockConnected } },
  }),
}));
jest.mock('@/features/voice/hooks', () => ({ useHeyClovieOn: () => false }));

const flush = () => act(async () => undefined);

type Out = { story?: unknown; list?: unknown; bump?: () => void };

function Probe({ out }: { out: Out }) {
  const [, setTick] = React.useState(0);
  out.bump = () => setTick((n) => n + 1);
  out.story = useSetupStory();
  out.list = useSetupChecklist();
  return null;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  resetReviewedStore();
  mockConnected = false;
  mockServices = [{}];
  mockHours = [{}];
  mockStaff = [{}];
  mockDetails = { phone: null, address: null };
});

describe('setup progress is live', () => {
  it('updates every consumer when a step is marked from another one', async () => {
    const a: Out = {};
    const b: Out = {};
    mount(
      <>
        <Probe out={a} />
        <Probe out={b} />
      </>,
    );
    await flush();
    expect(a.story).toMatchObject({ done: 0 });
    act(() =>
      (a.list as ReturnType<typeof useSetupChecklist>).markReviewed('services'),
    );
    expect(b.story).toMatchObject({ done: 1 });
    expect(a.story).toMatchObject({ done: 1 });
  });

  it('updates when the underlying data changes after a mutation', async () => {
    const out: Out = {};
    mount(<Probe out={out} />);
    await flush();
    mockDetails = { phone: '+27111', address: null };
    act(() => out.bump?.());
    expect(out.story).toMatchObject({ done: 1 });
  });

  it('counts WhatsApp the moment it is connected', async () => {
    const out: Out = {};
    mount(<Probe out={out} />);
    await flush();
    expect(out.story).toMatchObject({ done: 0 });
    mockConnected = true;
    act(() => out.bump?.());
    expect(out.story).toMatchObject({ done: 1 });
  });
});
