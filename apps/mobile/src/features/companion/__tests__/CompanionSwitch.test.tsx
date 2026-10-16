import * as React from 'react';

import { mount, text } from '@/testing/render';

import { CompanionSwitch } from '../components/CompanionSwitch';

let mockEnabled = false;
jest.mock('@/lib/env', () => ({
  get companionSdkEnabled() {
    return mockEnabled;
  },
}));
jest.mock('../sdk/CompanionSdkScreen', () => {
  const { Text } = require('react-native');
  return { CompanionSdkScreen: () => <Text>sdk-sheet</Text> };
});
jest.mock('../components/CompanionScreen', () => {
  const { Text } = require('react-native');
  return { CompanionScreen: () => <Text>iframe-sheet</Text> };
});

describe('CompanionSwitch', () => {
  it('keeps the iframe sheet when the flag is off', () => {
    mockEnabled = false;
    const out = text(mount(<CompanionSwitch />));
    expect(out).toContain('iframe-sheet');
    expect(out).not.toContain('sdk-sheet');
  });

  it('shows the SDK sheet when the flag is on', () => {
    mockEnabled = true;
    const out = text(mount(<CompanionSwitch />));
    expect(out).toContain('sdk-sheet');
    expect(out).not.toContain('iframe-sheet');
  });
});
