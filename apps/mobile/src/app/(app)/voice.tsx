import { VoiceCommandScreen } from '@/features/voice/components/VoiceCommandScreen';

/** Deep link target `bookingadmin://voice?text=...` from the Hey Clovie service. */
export default function VoiceRoute() {
  return <VoiceCommandScreen />;
}
