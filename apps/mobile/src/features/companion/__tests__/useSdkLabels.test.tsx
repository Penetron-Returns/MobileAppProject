import * as path from 'path';
import * as React from 'react';

import enUS from '@/lib/i18n/locales/en-US.json';
import { mount } from '@/testing/render';

import { useSdkLabels } from '../sdk/useSdkLabels';

// `defaultLabels` is not re-exported from the package root (preview.2), so
// read it from the CJS build next to the package manifest.
const { defaultLabels } = jest.requireActual(
  path.join(
    path.dirname(require.resolve('@nerova/react-native/package.json')),
    'dist/cjs/labels.js',
  ),
) as { defaultLabels: Record<string, string> };

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

  it('keeps the SDK placeholders of every label', () => {
    const labels = readLabels();
    for (const [key, original] of Object.entries(defaultLabels)) {
      expect(placeholders(labels[key])).toEqual(placeholders(original));
    }
  });

  it('resolves every label to real text, never a key path', () => {
    for (const value of Object.values(readLabels())) {
      expect(value).not.toMatch(/^companion\.sdk\./);
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('says Clovie where the SDK has no profile name yet', () => {
    expect(readLabels().openSheetNoName).toBe('Open Clovie');
  });
});
