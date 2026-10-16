import * as React from 'react';
import { Text } from 'react-native';

import { mount } from '@/testing/render';

import { ClovieButton } from '../components/ai/ClovieButton';

let mockReduce = false;
jest.mock('@booking/ui', () => ({
  ...jest.requireActual('@booking/ui'),
  useReduceMotion: () => mockReduce,
}));

function render(onPress = jest.fn()) {
  const tree = mount(
    <ClovieButton onPress={onPress}>
      <Text>clovie</Text>
    </ClovieButton>,
  );
  return { tree, onPress };
}

describe('ClovieButton', () => {
  beforeEach(() => {
    mockReduce = false;
  });

  it('renders the chat badge, hidden from accessibility', () => {
    const { tree } = render();
    const badge = tree.root.findByProps({ testID: 'clovie-chat-badge' });
    expect(badge.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('is one button labelled Clovie with a chat hint', () => {
    const { tree } = render();
    const button = tree.root.find(
      (n) => n.props.accessibilityRole === 'button',
    );
    expect(button.props.accessibilityLabel).toBe('Clovie');
    expect(button.props.accessibilityHint).toBe('Double-tap to chat');
  });

  it('opens the companion on press', () => {
    const { tree, onPress } = render();
    const button = tree.root.find(
      (n) => n.props.accessibilityRole === 'button',
    );
    button.props.onPress();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('scales Clovie on press feedback normally', () => {
    const { tree } = render();
    const body = tree.root.findByProps({ testID: 'clovie-button-body' });
    expect(body.props.style.transform).toBeDefined();
  });

  it('applies no scale with Reduce Motion on', () => {
    mockReduce = true;
    const { tree } = render();
    const body = tree.root.findByProps({ testID: 'clovie-button-body' });
    expect(body.props.style).toBeUndefined();
    expect(
      tree.root.findByProps({ testID: 'clovie-button-ring' }).props.style,
    ).toBeDefined();
  });
});
