import { useLocalSearchParams } from 'expo-router';

import { ConversationScreen } from '@/features/inbox/components/ConversationScreen';

export default function ConversationRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ConversationScreen conversationId={id} />;
}
