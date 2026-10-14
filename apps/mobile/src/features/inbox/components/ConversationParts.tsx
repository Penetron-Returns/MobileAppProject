import {
  Button,
  EmptyState,
  cn,
  goBack,
  Screen,
  StackHeader,
  Text,
  useDepth,
} from '@booking/ui';
import { MessageSquareOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { type ThreadMessage } from '../hooks';
import { messageOptions, messageText, senderOf } from '../logic';

/** The conversation was deleted or the link is wrong: say so, and the way back. */
export function ConversationNotFound() {
  const { t } = useTranslation();
  return (
    <Screen
      header={<StackHeader title={t('inbox.title')} fallbackHref="/inbox" />}
    >
      <EmptyState
        variant="screen"
        icon={MessageSquareOff}
        title={t('conversation.notFound.title')}
        description={t('conversation.notFound.description')}
        action={
          <Button variant="secondary" onPress={() => goBack('/inbox')}>
            <Text>{t('conversation.notFound.action')}</Text>
          </Button>
        }
      />
    </Screen>
  );
}

export function Bubble({ message }: { message: ThreadMessage }) {
  const { t } = useTranslation();
  const depth = useDepth();
  const sender = senderOf(message);
  const text = messageText(message.body) ?? t('inbox.noText');
  const options = messageOptions(message.body);
  const isOut = sender !== 'customer';
  const staff = sender === 'staff';
  return (
    <View
      className={cn('max-w-[82%] gap-1', isOut ? 'self-end' : 'self-start')}
    >
      {sender === 'bot' ? (
        <Text className="px-1 text-meta text-muted-foreground">
          {t('conversation.bookingMenu')}
        </Text>
      ) : null}
      <View
        style={staff ? { backgroundColor: depth.colors.tint } : undefined}
        className={cn(
          'rounded-[20px] px-3.5 py-2',
          !staff && (isOut ? 'bg-accent' : 'bg-muted'),
        )}
      >
        <Text
          selectable
          className={cn('text-title', staff && 'text-primary-foreground')}
        >
          {text}
        </Text>
        {options.length > 0 ? (
          <View className="mt-2 gap-1.5">
            {options.map((o) => (
              <View key={o} className="rounded-xl bg-background px-3 py-1.5">
                <Text className="text-center text-subtitle text-primary">
                  {o}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}
