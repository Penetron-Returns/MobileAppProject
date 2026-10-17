import '@/lib/i18n';

import * as React from 'react';
import { TextInput } from 'react-native';
import { act, mount } from '@/testing/render';
import type { ReactTestInstance } from 'react-test-renderer';

function text(node: ReactTestInstance): string {
  return node.children
    .map((c) => (typeof c === 'string' ? c : text(c)))
    .join('');
}

import { CodeBoxes } from '../components/CodeBoxes';
import { CodeStep } from '../components/CodeStep';
import { sanitizeCode } from '../logic';

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});
jest.mock('@/hooks/useNow', () => ({ useNow: () => new Date(0) }));

function Harness({ onVerify }: { onVerify: (code: string) => void }) {
  return (
    <CodeStep
      identifier="colin@nerova.com"
      strategy="email_code"
      isBusy={false}
      errorKey={null}
      resendAt={null}
      didResend={false}
      onVerify={onVerify}
      onResend={jest.fn()}
      onChangeIdentifier={jest.fn()}
      onEdit={jest.fn()}
    />
  );
}

function mountStep() {
  const onVerify = jest.fn();
  const tree = mount(<Harness onVerify={onVerify} />);
  const input = () => tree.root.findByType(TextInput);
  const type = (value: string) => act(() => input().props.onChangeText(value));
  const digits = () =>
    tree.root
      .findAll(
        (n) => n.props.testID === 'code-box' && typeof n.type === 'string',
      )
      .map((box) => text(box));
  return { tree, onVerify, input, type, digits };
}

describe('six-box code input', () => {
  it('renders six boxes', () => {
    const { digits } = mountStep();
    expect(digits()).toHaveLength(6);
  });

  it('fills the boxes as digits are typed and keeps only digits', () => {
    const { type, digits } = mountStep();
    type('48x2');
    expect(digits()).toEqual(['4', '8', '2', '', '', '']);
  });

  it('takes a pasted code with spaces and dashes whole, and continues by itself', () => {
    const { type, onVerify } = mountStep();
    type('123 456');
    expect(onVerify).toHaveBeenCalledTimes(1);
    expect(onVerify).toHaveBeenCalledWith('123456');
    expect(sanitizeCode('123-456')).toBe('123456');
  });

  it('continues on the sixth digit only, not before', () => {
    const { type, onVerify } = mountStep();
    type('12345');
    expect(onVerify).not.toHaveBeenCalled();
    type('123456');
    expect(onVerify).toHaveBeenCalledWith('123456');
  });

  it('backspace removes the last digit and does not continue', () => {
    const { type, onVerify, digits } = mountStep();
    type('1234');
    type('123');
    expect(digits()).toEqual(['1', '2', '3', '', '', '']);
    expect(onVerify).not.toHaveBeenCalled();
  });

  it('is one hidden field that offers the code from SMS and email', () => {
    const { input } = mountStep();
    expect(input().props.textContentType).toBe('oneTimeCode');
    expect(input().props.autoComplete).toBe('sms-otp');
    expect(input().props.keyboardType).toBe('number-pad');
    expect(input().props.accessibilityLabel).toBe('6-digit code');
  });

  it('sizes the boxes 48 by 56 with 8pt gaps', () => {
    const tree = mount(
      <CodeBoxes value="" onChangeText={jest.fn()} editable label="Code" />,
    );
    const box = tree.root.findAllByProps({ testID: 'code-box' })[0];
    const flat = Object.assign({}, ...[box.props.style].flat());
    expect(flat.width).toBe(48);
    expect(flat.height).toBe(56);
  });
});
