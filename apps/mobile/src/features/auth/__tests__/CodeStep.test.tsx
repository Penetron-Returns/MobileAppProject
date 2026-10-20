import '@/lib/i18n';

import * as React from 'react';
import { TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import renderer, { act } from 'react-test-renderer';

import { CodeStep } from '../components/CodeStep';

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

const metrics = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 375, height: 812 },
};

type Props = React.ComponentProps<typeof CodeStep>;

function mount(initial: Partial<Props> = {}) {
  const onVerify = jest.fn();
  const element = (extra: Partial<Props>) => (
    <SafeAreaProvider initialMetrics={metrics}>
      <CodeStep
        identifier="colin@example.com"
        strategy="email_code"
        isBusy={false}
        errorKey={null}
        resendAt={null}
        didResend={false}
        onVerify={onVerify}
        onResend={jest.fn()}
        onChangeIdentifier={jest.fn()}
        onEdit={jest.fn()}
        {...initial}
        {...extra}
      />
    </SafeAreaProvider>
  );
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(element({}));
  });
  return {
    tree,
    onVerify,
    update: (extra: Partial<Props>) => act(() => tree.update(element(extra))),
  };
}

const text = (tree: renderer.ReactTestRenderer) =>
  JSON.stringify(tree.toJSON());
const type = (tree: renderer.ReactTestRenderer, value: string) =>
  act(() => tree.root.findByType(TextInput).props.onChangeText(value));
const pressVerify = (tree: renderer.ReactTestRenderer) =>
  act(() =>
    tree.root.findByProps({ accessibilityLabel: 'Verify' }).props.onPress(),
  );

describe('CodeStep', () => {
  it('auto-submits the sixth digit and ignores a Verify tap for the same code', () => {
    const { tree, onVerify } = mount();
    type(tree, '123456');
    pressVerify(tree);
    pressVerify(tree);
    expect(onVerify).toHaveBeenCalledTimes(1);
    expect(onVerify).toHaveBeenCalledWith('123456');
  });

  it('does not submit an incomplete code', () => {
    const { tree, onVerify } = mount();
    type(tree, '123');
    pressVerify(tree);
    expect(onVerify).not.toHaveBeenCalled();
  });

  it('allows the same code again once the attempt has failed', () => {
    const { tree, onVerify, update } = mount();
    type(tree, '123456');
    update({ isBusy: true });
    update({ isBusy: false, errorKey: 'codeIncorrect' });
    pressVerify(tree);
    expect(onVerify).toHaveBeenCalledTimes(2);
  });

  it('says the code went by email', () => {
    expect(text(mount().tree)).toContain('Check your email');
  });

  it('says the code went by SMS, to the number', () => {
    const json = text(
      mount({ strategy: 'phone_code', identifier: '+27825550100' }).tree,
    );
    expect(json).toContain('Check your messages');
    expect(json).toContain('+27825550100');
    expect(json).toContain('Use a different number');
  });
});
