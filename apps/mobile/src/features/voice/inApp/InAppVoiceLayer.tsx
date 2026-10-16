import * as React from 'react';

import { useOpenCompanion } from '@/features/companion/sdk/useOpenCompanion';

import { InAppVoiceDrawer } from './InAppVoiceDrawer';
import { useInAppVoice } from './useInAppVoice';

/**
 * Mounted once in the signed-in shell next to the companion sheet. It attaches the voice drawer to the native
 * service, so "Hey Clovie" said while the app is open opens this drawer instead of the system overlay. Draws
 * nothing while voice is closed. "Show chat" opens the normal chat (the SDK sheet, or the route when it is down).
 */
export function InAppVoiceLayer() {
  const openChat = useOpenCompanion();
  const { state, levels, actions } = useInAppVoice({ onShowChat: openChat });
  if (state.phase === 'closed') return null;
  return <InAppVoiceDrawer state={state} levels={levels} actions={actions} />;
}
