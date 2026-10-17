import { Pressable } from '@booking/ui';
import { Volume2 } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useSpeak } from '@/hooks/useSpeak';

import { useOnbColors } from '../theme';

/**
 * The quiet read-aloud: a 44pt speaker icon, top right. Pressing it reads the
 * screen's line aloud (again to stop). `autoSpeak` reads it once on arrival.
 */
export function ReplayVoiceButton({
  text,
  autoSpeak = false,
}: {
  text: string;
  autoSpeak?: boolean;
}) {
  const { t } = useTranslation();
  const c = useOnbColors();
  const { isSpeaking, toggle } = useSpeak(text);
  const started = React.useRef(false);
  React.useEffect(() => {
    if (autoSpeak && !started.current) {
      started.current = true;
      toggle();
    }
  }, [autoSpeak, toggle]);
  return (
    <Pressable
      feedback="dim"
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={t('onboarding.replayVoice')}
      accessibilityState={{ selected: isSpeaking }}
      style={{
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Volume2 size={22} strokeWidth={1.8} color={c.secondary} />
    </Pressable>
  );
}
