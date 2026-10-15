import { Redirect, useLocalSearchParams } from 'expo-router';

import { ConversationScreen } from '@/features/inbox/components/ConversationScreen';
import { Gate } from '@/features/plans/components/Gate';

export default function ConversationRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Gate feature="inbox" fallback={<Redirect href="/" />}>
      <ConversationScreen conversationId={id} />
    </Gate>
  );
}
