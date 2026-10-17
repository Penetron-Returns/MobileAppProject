import * as React from 'react';

import { act, mount } from '@/testing/render';

import {
  reportSetupStep,
  resetSetupProgress,
  useSetupProgress,
} from '../sdk/companionSetupStore';

function read() {
  let value!: ReturnType<typeof useSetupProgress>;
  function Probe() {
    value = useSetupProgress();
    return null;
  }
  mount(<Probe />);
  return () => value;
}

beforeEach(() => resetSetupProgress());

describe('companion setup store', () => {
  it('starts empty', () => {
    expect(read()()).toEqual({ step: null, completed: [] });
  });

  it('records the step and each completed step once', () => {
    const get = read();
    act(() => {
      reportSetupStep({ step: 'connect_whatsapp', completed: false });
      reportSetupStep({ step: 'review', completed: true });
      reportSetupStep({ step: 'review', completed: true });
    });
    expect(get().step).toBe('review');
    expect(get().completed).toEqual(['review']);
  });
});
