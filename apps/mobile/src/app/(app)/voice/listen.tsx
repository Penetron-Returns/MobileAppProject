import { router } from 'expo-router';

import { useTalkOnOpen } from '@/features/voice/oneTap';

const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
const grant = () => router.replace('/settings/voice');

/** Deep link `bookingadmin://voice/listen`: listen for one command, then return to where you were. */
export default function VoiceListenRoute() {
  useTalkOnOpen(leave, grant);
  return null;
}
