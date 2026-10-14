import {
  Button,
  cn,
  ErrorState,
  goBack,
  Ground,
  InsetInput,
  Skeleton,
  Text,
  useDepth,
} from '@booking/ui';
import { router } from 'expo-router';
import { ChevronDown, ChevronLeft, Send } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { describeError } from '@/lib/toast';
import { formatPhone } from '@/lib/format';

import {
  useConversation,
  useInboxRealtime,
  useReleaseConversation,
  useSendReply,
  useThreadMessages,
  type ThreadMessage,
} from '../hooks';
import {
  collapseMenuExchange,
  messageOptions,
  messageText,
  needsReply,
  replyHoursLeft,
  senderOf,
} from '../logic';

/** One WhatsApp thread: read it, reply inside the free window, hand it back to the booking menu. */
export function ConversationScreen({
  conversationId,
}: {
  conversationId: string;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const insets = useSafeAreaInsets();
  const head = useConversation(conversationId);
  const messages = useThreadMessages(conversationId);
  const [draft, setDraft] = React.useState('');
  const [menuOpen, setMenuOpen] = React.useState(false);
  const scrollRef = React.useRef<ScrollView>(null);
  useInboxRealtime(true);

  const send = useSendReply(conversationId, () => setDraft(''));
  const release = useReleaseConversation(conversationId, () =>
    goBack('/inbox'),
  );

  const client = head.data?.client;
  const name = client ? (client.name ?? formatPhone(client.phone_e164)) : ' ';
  const needs = head.data ? needsReply(head.data) : false;
  const hours = head.data
    ? replyHoursLeft(head.data.window_expires_at, new Date())
    : null;
  const canReply = hours !== null;

  const items = React.useMemo(
    () => collapseMenuExchange(messages.data ?? []),
    [messages.data],
  );

  const submit = () => {
    const text = draft.trim();
    if (text && canReply) send.mutate(text);
  };

  let body: React.ReactNode;
  if ((head.isError && !head.data) || (messages.isError && !messages.data)) {
    body = (
      <ErrorState
        variant="banner"
        {...describeError(head.error ?? messages.error)}
        onRetry={() => {
          void head.refetch();
          void messages.refetch();
        }}
      />
    );
  } else if (head.isPending || messages.isPending) {
    body = (
      <View className="gap-3 px-5 pt-6">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-10 w-1/2 self-end" />
        <Skeleton className="h-10 w-3/5" />
      </View>
    );
  } else {
    body = (
      <View className="gap-1.5 px-4 pt-4">
        {items.map((item) =>
          item.kind === 'bot-group' ? (
            <Pressable
              key={item.id}
              onPress={() => setMenuOpen((o) => !o)}
              accessibilityRole="button"
              accessibilityState={{ expanded: menuOpen }}
              className="min-h-11 flex-row items-center justify-center gap-1"
            >
              <Text className="text-subtitle text-muted-foreground">
                {t('conversation.menuGroup', { count: item.messages.length })}
              </Text>
              <ChevronDown
                size={16}
                color={depth.colors.secondary}
                style={{
                  transform: [{ rotate: menuOpen ? '180deg' : '0deg' }],
                }}
              />
            </Pressable>
          ) : null,
        )}
        {menuOpen
          ? items.flatMap((item) =>
              item.kind === 'bot-group'
                ? item.messages.map((m) => <Bubble key={m.id} message={m} />)
                : [],
            )
          : null}
        {items.map((item) =>
          item.kind === 'message' ? (
            <Bubble key={item.message.id} message={item.message} />
          ) : null,
        )}
        {needs ? (
          <Text className="py-3 text-center text-meta text-muted-foreground">
            {t('conversation.handedOver')}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <Ground className="flex-1">
      <View style={{ paddingTop: insets.top + 8 }} className="px-3 pb-2">
        <Pressable
          onPress={() => goBack('/inbox')}
          accessibilityRole="button"
          accessibilityLabel={t('inbox.title')}
          className="min-h-11 flex-row items-center self-start"
        >
          <ChevronLeft size={24} strokeWidth={2.4} color={depth.colors.tint} />
          <Text style={{ color: depth.colors.tint }} className="text-title">
            {t('inbox.title')}
          </Text>
        </Pressable>
        <Text
          role="heading"
          aria-level="1"
          numberOfLines={1}
          className="px-2 text-section font-bold"
        >
          {name}
        </Text>
        <Text
          style={needs ? { color: depth.colors.amber } : undefined}
          className={cn(
            'px-2 text-subtitle',
            !needs && 'text-muted-foreground',
          )}
        >
          {needs ? t('inbox.needsReply') : t('conversation.menuReplying')}
        </Text>
      </View>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: false })
          }
          className="flex-1"
        >
          <View className="w-full max-w-2xl self-center">{body}</View>
        </ScrollView>
        <View
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}
          className="gap-2 px-4 pt-2"
        >
          <Text className="text-center text-meta text-muted-foreground">
            {canReply
              ? t('conversation.window', { count: hours })
              : t('conversation.windowClosed')}
          </Text>
          <View className="flex-row gap-2">
            {client ? (
              <Button
                variant="secondary"
                className="flex-1"
                onPress={() =>
                  router.push({
                    pathname: '/add',
                    params: { clientId: client.id },
                  } as never)
                }
                accessibilityLabel={t('conversation.bookFor', {
                  name: name.split(' ')[0],
                })}
              >
                <Text className="text-subtitle">
                  {t('conversation.bookFor', { name: name.split(' ')[0] })}
                </Text>
              </Button>
            ) : null}
            <Button
              variant="secondary"
              className="flex-1"
              disabled={release.isPending}
              onPress={() => release.mutate(null)}
              accessibilityLabel={t('conversation.release')}
            >
              <Text className="text-subtitle">{t('conversation.release')}</Text>
            </Button>
          </View>
          <InsetInput
            label={t('conversation.messageLabel', { name })}
            placeholder={t('conversation.placeholder', {
              name: name.split(' ')[0],
            })}
            value={draft}
            onChangeText={setDraft}
            editable={canReply}
            multiline
            radius={22}
            trailing={
              <Pressable
                onPress={submit}
                disabled={!draft.trim() || !canReply || send.isPending}
                accessibilityRole="button"
                accessibilityLabel={t('conversation.send')}
                className={cn(
                  'h-11 w-11 items-center justify-center',
                  (!draft.trim() || !canReply) && 'opacity-40',
                )}
              >
                <Send size={22} strokeWidth={1.8} color={depth.colors.tint} />
              </Pressable>
            }
          />
        </View>
      </KeyboardAvoidingView>
    </Ground>
  );
}

function Bubble({ message }: { message: ThreadMessage }) {
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
