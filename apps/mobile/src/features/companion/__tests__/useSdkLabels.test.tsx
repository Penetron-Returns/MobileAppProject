import { defaultLabels } from '@nerova/react-native';
import * as React from 'react';

import enUS from '@/lib/i18n/locales/en-US.json';
import { mount } from '@/testing/render';

import { useSdkLabels } from '../sdk/useSdkLabels';

const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();

function readLabels() {
  let labels: Record<string, string> = {};
  function Probe() {
    labels = useSdkLabels();
    return null;
  }
  mount(<Probe />);
  return labels;
}

describe('SDK labels', () => {
  it('covers every key in the SDK defaultLabels, and nothing else', () => {
    expect(Object.keys(enUS.companion.sdk).sort()).toEqual(
      Object.keys(defaultLabels).sort(),
    );
  });

  // The avatar button hints ("Opens the chat") deliberately drop {name}: the
  // button's own label already says who it is.
  const HINTS = ['openSheet', 'closeSheet'];

  it('keeps the SDK placeholders of every label', () => {
    const labels = readLabels();
    for (const [key, original] of Object.entries(defaultLabels)) {
      if (HINTS.includes(key)) continue;
      expect(placeholders(labels[key])).toEqual(placeholders(original));
    }
  });

  it('words the open and close labels as hints', () => {
    const labels = readLabels();
    expect(labels.openSheet).toBe('Opens the chat');
    expect(labels.closeSheet).toBe('Closes the chat');
  });

  it('resolves every label to real text, never a key path', () => {
    for (const value of Object.values(readLabels())) {
      expect(value).not.toMatch(/^companion\.sdk\./);
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('says Clovie where the SDK has no profile name yet', () => {
    expect(readLabels().avatarButtonNoName).toBe('Clovie, {state}');
  });
});
