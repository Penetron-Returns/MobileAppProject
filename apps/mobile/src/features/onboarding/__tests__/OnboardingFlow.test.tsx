import * as React from 'react';

import { act, flush, mount, pressableByLabel, text } from '@/testing/render';

import { initialDraft, type OnboardingDraft } from '../logic';
import { OnboardingFlow } from '../components/OnboardingFlow';

jest.mock('@clerk/expo', () => ({
  useUser: () => ({ user: { fullName: 'Zoe Dlamini', firstName: 'Zoe' } }),
}));
jest.mock('@/features/brand/ClovieLoading', () => ({
  ClovieLoading: () => null,
}));

const mockMutate = jest.fn();
let mockError: unknown = null;
jest.mock('../hooks', () => ({
  useCompleteOnboarding: () => ({
    mutateAsync: (...a: unknown[]) => mockMutate(...a),
    isPending: false,
    error: mockError,
  }),
}));

let mockStored: OnboardingDraft = initialDraft();
const mockSave = jest.fn();
const mockClear = jest.fn();
jest.mock('../storage', () => ({
  loadDraft: () => Promise.resolve(mockStored),
  saveDraft: (...a: unknown[]) => mockSave(...a),
  clearDraft: () => mockClear(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockStored = initialDraft();
  mockError = null;
  mockMutate.mockResolvedValue({});
});

async function open(onDone = jest.fn()) {
  const tree = mount(<OnboardingFlow onDone={onDone} />);
  await flush();
  return { tree, onDone };
}

describe('OnboardingFlow', () => {
  it('asks one question at a time: first the business type, in four big cards', async () => {
    const { tree } = await open();
    const out = text(tree);
    expect(out).toContain('What kind of business?');
    for (const type of ['Barber', 'Salon', 'Beauty parlour', 'Mix']) {
      expect(out).toContain(type);
    }
    expect(out).not.toContain("What's your business called?");
  });

  it('one tap on a type moves to the name and saves the draft', async () => {
    const { tree } = await open();
    act(() => pressableByLabel(tree, 'Barber').props.onPress());
    expect(text(tree)).toContain("What's your business called?");
    expect(mockSave).toHaveBeenLastCalledWith({
      step: 2,
      typeId: 'barber',
      businessName: '',
    });
  });

  it('every question has a speaker button that reads it aloud', async () => {
    const { tree } = await open();
    const speak = () =>
      tree.root.findAll(
        (n) => n.props.accessibilityLabel === 'Read aloud' && !!n.props.onPress,
      );
    expect(speak().length).toBeGreaterThan(0);
    act(() => pressableByLabel(tree, 'Barber').props.onPress());
    expect(speak().length).toBeGreaterThan(0);
  });

  it('keeps Continue off until there is a name, then submits the template defaults at once', async () => {
    const { tree, onDone } = await open();
    act(() => pressableByLabel(tree, 'Salon').props.onPress());
    const input = tree.root.find(
      (n) => typeof n.props.onChangeText === 'function' && n.props.placeholder,
    );
    const continueButton = () => pressableByLabel(tree, 'Continue');
    expect(continueButton().props.disabled).toBe(true);

    act(() => input.props.onChangeText('Ashgrove Hair'));
    expect(continueButton().props.disabled).toBe(false);
    await act(async () => continueButton().props.onPress());

    expect(mockMutate).toHaveBeenCalledTimes(1);
    const request = mockMutate.mock.calls[0][0];
    expect(request.business).toEqual({ name: 'Ashgrove Hair' });
    expect(request.owner_name).toBe('Zoe Dlamini');
    expect(request.team).toEqual([]);
    expect(request.hours).toHaveLength(6);
    expect(request.services.length).toBeGreaterThan(0);
    expect(mockClear).toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('resumes a killed app on the name question with what was typed', async () => {
    mockStored = { step: 2, typeId: 'beauty', businessName: 'Glow' };
    const { tree } = await open();
    expect(text(tree)).toContain("What's your business called?");
    const input = tree.root.find(
      (n) => typeof n.props.onChangeText === 'function' && n.props.placeholder,
    );
    expect(input.props.value).toBe('Glow');
  });

  it('goes back to the type question without losing the name', async () => {
    mockStored = { step: 2, typeId: 'beauty', businessName: 'Glow' };
    const { tree } = await open();
    act(() => pressableByLabel(tree, 'Back').props.onPress());
    expect(text(tree)).toContain('What kind of business?');
    expect(mockSave).toHaveBeenLastCalledWith({
      step: 1,
      typeId: 'beauty',
      businessName: 'Glow',
    });
  });

  it('stays put and offers a retry when creating the business fails', async () => {
    mockStored = { step: 2, typeId: 'mix', businessName: 'Both' };
    mockMutate.mockRejectedValue(new Error('boom'));
    mockError = new Error('boom');
    const { tree, onDone } = await open();
    await act(async () => pressableByLabel(tree, 'Continue').props.onPress());
    expect(onDone).not.toHaveBeenCalled();
    expect(mockClear).not.toHaveBeenCalled();
    expect(text(tree)).toContain("What's your business called?");
  });
});
