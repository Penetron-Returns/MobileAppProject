import * as React from 'react';

import { mount, text } from '@/testing/render';

import { WelcomeStep } from '../components/WelcomeStep';

describe('WelcomeStep', () => {
  it('shows the Clovie mascot above the wordmark and the value prop', () => {
    const tree = mount(
      <WelcomeStep
        isBusy={false}
        errorKey={null}
        onGoogle={jest.fn()}
        onEmail={jest.fn()}
      />,
    );
    expect(
      tree.root.findAllByProps({ testID: 'clovie-sprite' }).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findByProps({ testID: 'clovie-wordmark' }).props
        .accessibilityLabel,
    ).toBe('Clovie');
    expect(text(tree)).toContain('Run your shop from your phone.');
    expect(text(tree)).not.toContain('Bookings, clients and WhatsApp');
  });
});
