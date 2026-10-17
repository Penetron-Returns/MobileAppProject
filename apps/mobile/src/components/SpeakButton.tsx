import { Pressable, useDepth } from '@booking/ui';
import { Square, Volume2 } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useSpeak } from '@/hooks/useSpeak';

/**
 * A round speaker button (56pt by default) that reads `text` aloud (and stops when pressed
 * again). Onboarding and setup screens carry one so the owner can listen
 * instead of read.
 */
export function SpeakButton({
  text,
  size = 56,
}: {
  text: string;
  /** 56 on onboarding screens; 44 (the minimum target) inside list rows. */
  size?: 44 | 56;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const { isSpeaking, toggle } = useSpeak(text);
  return (
    <Pressable
      feedback="inset"
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={isSpeaking ? t('speak.stop') : t('speak.read')}
      accessibilityState={{ selected: isSpeaking }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: depth.colors.tint,
      }}
    >
      {isSpeaking ? (
        <Square size={20} strokeWidth={2.2} color={depth.colors.onFill} />
      ) : (
        <Volume2 size={26} strokeWidth={2} color={depth.colors.onFill} />
      )}
    </Pressable>
  );
}
