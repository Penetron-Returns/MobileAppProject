import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { api } from '@/lib/api';
import { qk, useApiMutation } from '@/lib/query';
import { supabase, unwrap } from '@/lib/supabase';

const THREAD_SELECT =
  'id, state, window_expires_at, last_message_at, client:clients(id, name, phone_e164), escalations(id, status, reason), messages(body, direction, created_at)';

async function fetchThreads() {
  return unwrap(
    await supabase
      .from('conversations')
      .select(THREAD_SELECT)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { referencedTable: 'messages', ascending: false })
      .limit(1, { referencedTable: 'messages' })
      .limit(100),
  );
}

export type InboxThread = Awaited<ReturnType<typeof fetchThreads>>[number];

export function useInboxThreads() {
  return useQuery({ queryKey: qk.conversations, queryFn: fetchThreads });
}

async function fetchConversation(id: string) {
  const res = await supabase
    .from('conversations')
    .select(
      'id, state, window_expires_at, client:clients(id, name, phone_e164), escalations(id, status)',
    )
    .eq('id', id)
    .maybeSingle();
  return unwrap<NonNullable<typeof res.data> | null>(res);
}

export type ConversationHead = NonNullable<
  Awaited<ReturnType<typeof fetchConversation>>
>;

export function useConversation(id: string) {
  return useQuery({
    queryKey: qk.conversation(id),
    queryFn: () => fetchConversation(id),
    enabled: Boolean(id),
  });
}

async function fetchMessages(conversationId: string) {
  const rows = unwrap(
    await supabase
      .from('messages')
      .select('id, direction, type, body, status, sent_by, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(200),
  );
  return rows.reverse();
}

export type ThreadMessage = Awaited<ReturnType<typeof fetchMessages>>[number];

export function useThreadMessages(conversationId: string) {
  return useQuery({
    queryKey: qk.messages(conversationId),
    queryFn: () => fetchMessages(conversationId),
    enabled: Boolean(conversationId),
  });
}

/** Realtime: any change to conversations, messages or escalations refreshes the inbox queries. */
export function useInboxRealtime(enabled: boolean) {
  const queryClient = useQueryClient();
  // supabase-js reuses a channel per topic and refuses `.on` after subscribe, so each caller needs its own topic.
  const topic = `inbox-changes-${React.useId()}`;
  React.useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: qk.conversations });
      void queryClient.invalidateQueries({ queryKey: ['messages'] });
      void queryClient.invalidateQueries({ queryKey: ['escalations'] });
    };
    let channel = supabase.channel(topic);
    for (const table of ['conversations', 'messages', 'escalations']) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        refresh,
      );
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, queryClient, topic]);
}

const INBOX_KEYS = [qk.conversations, ['messages'], ['escalations']];

export function useSendReply(conversationId: string, onSent?: () => void) {
  return useApiMutation<string>({
    mutationFn: (text, key) =>
      api.sendStaffMessage(conversationId, { text }, key),
    invalidate: INBOX_KEYS,
    onSuccess: onSent,
  });
}

export function useReleaseConversation(
  conversationId: string,
  onDone?: () => void,
) {
  return useApiMutation<null>({
    mutationFn: (_v, key) => api.releaseConversation(conversationId, key),
    invalidate: INBOX_KEYS,
    onSuccess: onDone,
  });
}
