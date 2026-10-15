import * as React from 'react';

import { mount, text } from '@/testing/render';

import { WelcomeStep } from '../components/WelcomeStep';

jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  return { WebView: View };
});

describe('WelcomeStep', () => {
  it('shows the idle Clovie above the Clovie name instead of the app tile', () => {
    const tree = mount(
      <WelcomeStep
        isBusy={false}
        errorKey={null}
        onGoogle={jest.fn()}
        onEmail={jest.fn()}
      />,
    );
    const web = tree.root.findAllByProps({ testID: 'clovie-webview' });
    expect(web[0].props.source.html).toContain('"state":"default"');
    expect(text(tree)).toContain('Clovie');
  });
});
