import '@/lib/i18n';

import i18n from 'i18next';
import * as React from 'react';
import renderer, { act } from 'react-test-renderer';

import { ExplainerStage } from '../ExplainerStage';
import { SCENES, type SceneId } from '../scenes';
import { slotTimes } from '../scenes/bookingRules';
import {
  shortDays,
  shortMinutes,
  shortReminder,
  shortSeconds,
} from '../labels';

jest.mock('expo-router', () => ({ useFocusEffect: () => undefined }));
jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

const t = i18n.t.bind(i18n);

describe('ExplainerStage', () => {
  it.each(Object.keys(SCENES) as SceneId[])(
    'draws the %s scene as a decorative 76pt stage',
    (scene) => {
      let tree!: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(<ExplainerStage scene={scene} />);
      });
      const stage = tree.root.find(
        (n) => n.props.testID === `explainer-${scene}`,
      );
      expect(stage.props.importantForAccessibility).toBe('no-hide-descendants');
      expect(stage.props.accessibilityElementsHidden).toBe(true);
      expect(stage.props.accessible).toBe(false);
    },
  );
});

describe('scene labels', () => {
  it('spaces the interval chips by the chosen step', () => {
    expect(slotTimes(15)).toEqual([
      '9:00',
      '9:15',
      '9:30',
      '9:45',
      '10:00',
      '10:15',
    ]);
    expect(slotTimes(60)[5]).toBe('14:00');
  });

  it.each([
    [30, '30 min'],
    [60, '1 h'],
    [1440, '24 h'],
    [90, '90 min'],
  ])('shortens %s minutes', (minutes, expected) => {
    expect(shortMinutes(t, minutes)).toBe(expected);
  });

  it('shortens days, seconds and reminders', () => {
    expect(shortDays(t, 60)).toBe('60 days');
    expect(shortSeconds(t, 30)).toBe('30 s');
    expect(shortSeconds(t, 120)).toBe('2 min');
    expect(shortReminder(t, [1440, 120])).toBe('1 day');
    expect(shortReminder(t, [120])).toBe('2 h');
    expect(shortReminder(t, [])).toBeUndefined();
  });
});
