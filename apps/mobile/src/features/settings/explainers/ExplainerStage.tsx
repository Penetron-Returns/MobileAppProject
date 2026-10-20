import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useStagePalette } from './palette';
import { SCENES, type SceneId } from './scenes';
import type { SceneWords } from './scenes/parts';
import { usePlayOnce } from './usePlayOnce';

export interface ExplainerStageProps {
  scene: SceneId;
  /** Position of this thumbnail on its page; staggers the first play. */
  index?: number;
  /** The row's live value as a short label ("1 h", "60 days"). */
  label?: string;
  stepMinutes?: number;
  size?: 'md' | 'sm';
}

const STAGGER_MS = 140;
const STAGE = 76;
const SMALL = 44;

/**
 * The small decorative picture on the left of a settings row: a 76pt rounded
 * stage (44pt small) drawn from simple boxes, in the finished frame at rest.
 * It plays its scene once when the page opens and again when tapped, then
 * stays still. Hidden from screen readers; the row carries the meaning.
 */
export function ExplainerStage({
  scene,
  index = 0,
  label,
  stepMinutes,
  size = 'md',
}: ExplainerStageProps) {
  const { t } = useTranslation();
  const c = useStagePalette();
  const { progress, play } = usePlayOnce(index * STAGGER_MS);
  const Scene = SCENES[scene];
  const words: SceneWords = {
    anyone: t('settings.explainers.anyone'),
    month: t('settings.explainers.month'),
    closed: t('settings.explainers.closed'),
  };
  const isSmall = size === 'sm';
  const side = isSmall ? SMALL : STAGE;
  return (
    <Pressable
      onPress={play}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={`explainer-${scene}`}
      style={{
        width: side,
        height: side,
        borderRadius: isSmall ? 11 : 14,
        overflow: 'hidden',
        backgroundColor: c.stageTop,
        experimental_backgroundImage: `linear-gradient(180deg, ${c.stageTop} 0%, ${c.stageBottom} 100%)`,
        boxShadow:
          'inset 0 0 0 0.5px rgba(16,24,40,0.09), inset 0 1px 2px rgba(16,24,40,0.06)',
      }}
    >
      <View
        pointerEvents="none"
        style={{
          width: STAGE,
          height: STAGE,
          transform: isSmall ? [{ scale: SMALL / STAGE }] : undefined,
          transformOrigin: 'left top',
        }}
      >
        <Scene
          progress={progress}
          c={c}
          label={label}
          stepMinutes={stepMinutes}
          words={words}
        />
      </View>
    </Pressable>
  );
}
