import * as React from 'react';
import { TextInput } from 'react-native';

import { setAnalytics } from '@/features/analytics';
import { createFakeAnalytics } from '@/features/analytics/testing';
import { act, flush, mount, pressableByLabel, text } from '@/testing/render';

import { ReviseBusinessFlow } from '../components/ReviseBusinessFlow';

jest.mock('@/features/brand/ClovieAnimated', () => ({
  ClovieAnimated: () => null,
}));

const mockRevise = jest.fn();
jest.mock('../hooks', () => ({
  useReviseBusiness: () => ({
    isPending: false,
    mutateAsync: (...a: unknown[]) => mockRevise(...a),
  }),
}));
const mockSaveType = jest.fn();
jest.mock('../storage', () => ({
  saveBusinessType: (...a: unknown[]) => mockSaveType(...a),
}));

const onDone = jest.fn();
let fake: ReturnType<typeof createFakeAnalytics>;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockRevise.mockResolvedValue({});
  fake = createFakeAnalytics();
  setAnalytics(fake);
});
afterEach(() => {
  jest.useRealTimers();
  setAnalytics();
});

async function open(typeId: 'salon' | null = 'salon') {
  const tree = mount(
    <ReviseBusinessFlow
      current={{ name: 'Ashgrove', typeId }}
      onDone={onDone}
    />,
  );
  await flush();
  return tree;
}

describe('Back from the plan: revising the business', () => {
  it('opens on the name, prefilled with the current business name', async () => {
    const tree = await open();
    expect(text(tree)).toContain('Salon. Lovely!');
    expect(tree.root.findByType(TextInput).props.value).toBe('Ashgrove');
  });

  it('opens on the type when the type is not known', async () => {
    const tree = await open(null);
    expect(text(tree)).toContain('What kind of business?');
  });

  it('Back from the name goes to the type; Back from the type returns to the plan', async () => {
    const tree = await open();
    act(() => pressableByLabel(tree, 'Back').props.onPress());
    expect(text(tree)).toContain('What kind of business?');
    expect(onDone).not.toHaveBeenCalled();
    act(() => pressableByLabel(tree, 'Back').props.onPress());
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(mockRevise).not.toHaveBeenCalled();
    expect(fake.names()).toEqual(['onboarding_back', 'onboarding_back']);
  });

  it('Continue with nothing changed returns to the plan without calling the API', async () => {
    const tree = await open();
    act(() => pressableByLabel(tree, 'Continue').props.onPress());
    await flush();
    expect(mockRevise).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('saves a changed name and returns to the plan', async () => {
    const tree = await open();
    act(() =>
      tree.root.findByType(TextInput).props.onChangeText('Ashgrove Hair'),
    );
    act(() => pressableByLabel(tree, 'Continue').props.onPress());
    await flush();
    expect(mockRevise).toHaveBeenCalledTimes(1);
    expect(mockRevise.mock.calls[0]?.[0]).toMatchObject({
      revise: true,
      business: { name: 'Ashgrove Hair' },
    });
    expect(mockSaveType).toHaveBeenCalledWith('salon');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("a changed type re-applies that type's template", async () => {
    const tree = await open();
    act(() => pressableByLabel(tree, 'Back').props.onPress());
    act(() => pressableByLabel(tree, 'Barbershop').props.onPress());
    act(() => void jest.advanceTimersByTime(400));
    act(() => pressableByLabel(tree, 'Continue').props.onPress());
    await flush();
    expect(mockRevise.mock.calls[0]?.[0].services[0].name).toBe('Skin fade');
    expect(mockSaveType).toHaveBeenCalledWith('barber');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('shows a retry when saving fails and stays off the plan', async () => {
    mockRevise.mockRejectedValueOnce(new Error('offline'));
    const tree = await open();
    act(() => tree.root.findByType(TextInput).props.onChangeText('New name'));
    act(() => pressableByLabel(tree, 'Continue').props.onPress());
    await flush();
    expect(onDone).not.toHaveBeenCalled();
    expect(text(tree)).toContain('Try again');
  });
});
