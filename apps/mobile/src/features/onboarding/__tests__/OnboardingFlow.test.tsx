import * as React from 'react';
import { TextInput } from 'react-native';

import { setAnalytics } from '@/features/analytics';
import {
  createFakeAnalytics,
  type FakeAnalytics,
} from '@/features/analytics/testing';
import { act, flush, mount, pressableByLabel, text } from '@/testing/render';

import { OnboardingFlow } from '../components/OnboardingFlow';
import { initialDraft, type OnboardingDraft } from '../logic';

let mockSignedIn = false;
const mockSignOut = jest.fn();
jest.mock('@/features/auth/useSignOut', () => ({
  useSignOut: () => mockSignOut,
}));
jest.mock('@clerk/expo', () => ({
  useAuth: () => ({ isSignedIn: mockSignedIn }),
  useUser: () => ({ user: { fullName: 'Zoe Dlamini', firstName: 'Zoe' } }),
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a) },
  useIsFocused: () => true,
}));
jest.mock('@/features/brand/ClovieLoading', () => ({
  ClovieLoading: () => null,
}));

const mockCreate = jest.fn();
jest.mock('../hooks', () => ({
  useCompleteOnboarding: () => ({
    mutateAsync: (...a: unknown[]) => mockCreate(...a),
  }),
}));

let mockStored: OnboardingDraft = initialDraft();
const mockSave = jest.fn();
const mockClear = jest.fn();
jest.mock('../storage', () => ({
  loadDraft: () => Promise.resolve(mockStored),
  saveDraft: (...a: unknown[]) => mockSave(...a),
  clearDraft: () => mockClear(),
  saveBusinessType: () => Promise.resolve(),
}));

let fake: FakeAnalytics;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockStored = initialDraft();
  mockCreate.mockResolvedValue({ business: { id: 'biz_1' } });
  fake = createFakeAnalytics();
  setAnalytics(fake);
});
afterEach(() => {
  jest.useRealTimers();
  setAnalytics();
});

async function open(props: { isSignedIn: boolean; onDone?: () => void }) {
  mockSignedIn = props.isSignedIn;
  const tree = mount(<OnboardingFlow {...props} />);
  await flush();
  return tree;
}
const advance = (ms: number) => act(() => void jest.advanceTimersByTime(ms));
const lastSaved = () => mockSave.mock.calls.at(-1)?.[0];

describe('signed out: welcome, type, name, then sign-in', () => {
  it('starts on the welcome and reports it once', async () => {
    const tree = await open({ isSignedIn: false });
    const out = text(tree);
    expect(out).toContain("Hi, I'm Clovie.");
    expect(out).toContain("Let's set up your business.");
    expect(out).toContain('About 1 minute');
    expect(fake.names()).toEqual(['onboarding_started']);
  });

  it('"I already have an account" goes straight to sign-in without saving a draft', async () => {
    const tree = await open({ isSignedIn: false });
    act(() =>
      pressableByLabel(tree, 'I already have an account').props.onPress(),
    );
    expect(mockPush).toHaveBeenCalledWith('/sign-in');
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('runs the screens in order and ends on the sign-in screen', async () => {
    const tree = await open({ isSignedIn: false });
    act(() => pressableByLabel(tree, 'Start').props.onPress());
    expect(text(tree)).toContain('What kind of business?');
    for (const label of ['Barbershop', 'Salon', 'Beauty parlor', 'A mix']) {
      expect(text(tree)).toContain(label);
    }

    // One tap on a tile advances (after the 400ms confirmation).
    act(() => pressableByLabel(tree, 'Salon').props.onPress());
    expect(text(tree)).toContain('What kind of business?');
    advance(400);
    expect(text(tree)).toContain('Salon. Lovely!');
    expect(lastSaved()).toEqual({ step: 2, typeId: 'salon', businessName: '' });

    const input = () => tree.root.findByType(TextInput);
    act(() => input().props.onChangeText("Thandi's Hair Studio"));
    expect(lastSaved().businessName).toBe("Thandi's Hair Studio");
    act(() => pressableByLabel(tree, 'Continue').props.onPress());

    expect(lastSaved()).toEqual({
      step: 3,
      typeId: 'salon',
      businessName: "Thandi's Hair Studio",
    });
    expect(mockPush).toHaveBeenCalledWith('/sign-in');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('keeps Continue off until there is a name', async () => {
    mockStored = { step: 2, typeId: 'barber', businessName: '' };
    const tree = await open({ isSignedIn: false });
    const cont = () => pressableByLabel(tree, 'Continue');
    expect(cont().props.accessibilityState.disabled).toBe(true);
    act(() => tree.root.findByType(TextInput).props.onChangeText('  '));
    expect(cont().props.accessibilityState.disabled).toBe(true);
    act(() => tree.root.findByType(TextInput).props.onChangeText('Cuts'));
    expect(cont().props.accessibilityState.disabled).toBe(false);
  });

  it('Back from the type returns to the welcome; from the name to the type', async () => {
    const tree = await open({ isSignedIn: false });
    act(() => pressableByLabel(tree, 'Start').props.onPress());
    act(() => pressableByLabel(tree, 'Back').props.onPress());
    expect(text(tree)).toContain("Hi, I'm Clovie.");
    act(() => pressableByLabel(tree, 'Start').props.onPress());
    act(() => pressableByLabel(tree, 'A mix').props.onPress());
    advance(400);
    act(() => pressableByLabel(tree, 'Back').props.onPress());
    expect(text(tree)).toContain('What kind of business?');
  });

  it('resumes a killed app on the name with what was typed', async () => {
    mockStored = { step: 2, typeId: 'beauty', businessName: 'Glow' };
    const tree = await open({ isSignedIn: false });
    expect(text(tree)).toContain('Beauty parlor. Lovely!');
    expect(tree.root.findByType(TextInput).props.value).toBe('Glow');
    expect(fake.names()).not.toContain('onboarding_started');
  });

  it('reopens a confirmed draft on the name, one tap from sign-in', async () => {
    mockStored = { step: 3, typeId: 'salon', businessName: 'Ashgrove' };
    const tree = await open({ isSignedIn: false });
    expect(tree.root.findByType(TextInput).props.value).toBe('Ashgrove');
    act(() => pressableByLabel(tree, 'Continue').props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/sign-in');
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('after sign-in', () => {
  it('creates the business from a confirmed draft once, then clears it', async () => {
    mockStored = { step: 3, typeId: 'barber', businessName: 'Cuts & Co' };
    const onDone = jest.fn();
    await open({ isSignedIn: true, onDone });
    await flush();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const request = mockCreate.mock.calls[0][0];
    expect(request.business).toEqual({
      name: 'Cuts & Co',
      timezone: expect.any(String),
      currency: expect.stringMatching(/^[A-Z]{3}$/),
    });
    expect(request.owner_name).toBe('Zoe Dlamini');
    expect(request.services.length).toBeGreaterThan(0);
    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);

    // Later renders and timers never submit a second time.
    advance(5000);
    await flush();
    expect(mockCreate).toHaveBeenCalledTimes(1);

    expect(fake.names()).toEqual(['business_created']);
    expect(fake.groups).toEqual([{ type: 'business', id: 'biz_1' }]);
  });

  it('with no draft starts on the business type, with no back and no welcome', async () => {
    const tree = await open({ isSignedIn: true });
    expect(text(tree)).toContain('What kind of business?');
    expect(() => pressableByLabel(tree, 'Back')).toThrow();
    expect(fake.names()).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('an unconfirmed draft waits for Continue on the name, then creates the business', async () => {
    mockStored = { step: 2, typeId: 'mix', businessName: 'Studio 9' };
    const tree = await open({ isSignedIn: true });
    expect(mockCreate).not.toHaveBeenCalled();
    act(() => pressableByLabel(tree, 'Continue').props.onPress());
    await flush();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    expect(fake.names()).toEqual([
      'onboarding_name_entered',
      'business_created',
    ]);
  });

  it('a failed create shows a calm retry, and retrying sends it again', async () => {
    mockStored = { step: 3, typeId: 'salon', businessName: 'Ashgrove' };
    mockCreate.mockRejectedValueOnce(new Error('offline'));
    const tree = await open({ isSignedIn: true });
    await flush();
    expect(text(tree)).toContain("Couldn't create your business");
    expect(mockCreate).toHaveBeenCalledTimes(1);
    act(() => pressableByLabel(tree, 'Try again').props.onPress());
    await flush();
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockClear).toHaveBeenCalledTimes(1);
  });
});

describe('analytics privacy', () => {
  it('never carries the business name, email or phone in any event', async () => {
    const tree = await open({ isSignedIn: false });
    act(() => pressableByLabel(tree, 'Start').props.onPress());
    act(() => pressableByLabel(tree, 'Salon').props.onPress());
    advance(400);
    act(() =>
      tree.root
        .findByType(TextInput)
        .props.onChangeText("Thandi's Hair Studio"),
    );
    act(() => pressableByLabel(tree, 'Continue').props.onPress());

    expect(fake.names()).toEqual([
      'onboarding_started',
      'onboarding_type_selected',
      'onboarding_name_entered',
    ]);
    expect(fake.events[1].props).toEqual({ type: 'salon' });
    expect(fake.events[2].props).toEqual({});
    expect(JSON.stringify(fake.events)).not.toMatch(/Thandi|Hair|Studio/);
    expect(fake.identified).toEqual([]);
  });
});

const hasLabel = (tree: ReturnType<typeof mount>, label: string) =>
  tree.root.findAll((n) => n.props.accessibilityLabel === label).length > 0;

describe('sign-out and hardware Back during first run', () => {
  it('offers a quiet sign-out only once signed in', async () => {
    const out = await open({ isSignedIn: false });
    expect(hasLabel(out, 'Not you? Sign out')).toBe(false);
    const inn = await open({ isSignedIn: true });
    const control = pressableByLabel(inn, 'Not you? Sign out');
    act(() => control.props.onPress());
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
