import { ConversationScreen } from '@/features/inbox/components/ConversationScreen';
import { Gate } from '@/features/plans/components/Gate';
import { useLocalSearchParams } from 'expo-router';

export default function ConversationRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Gate feature="inbox">
      <ConversationScreen conversationId={id} />
    </Gate>
  );
}
