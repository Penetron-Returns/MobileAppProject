import {
  Button,
  Group,
  InsetInput,
  SectionTitle,
  Skeleton,
  Text,
  useDepth,
} from '@booking/ui';
import { AlertTriangle, Coffee, StickyNote, X } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import {
  useAddClientNote,
  useClientNotes,
  useDeleteClientNote,
  type ClientNoteRow,
} from '../hooks';

const KIND_ICON = {
  warning: AlertTriangle,
  preference: Coffee,
  general: StickyNote,
} as const;

/** Notes about a client: the team's list, add one, remove one. */
export function ClientNotesCard({
  clientId,
  firstName,
}: {
  clientId: string;
  firstName: string;
}) {
  const { t } = useTranslation();
  const notes = useClientNotes(clientId);
  const addNote = useAddClientNote(clientId);
  const deleteNote = useDeleteClientNote(clientId);
  const [draft, setDraft] = React.useState('');

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    addNote.mutate({ body });
    setDraft('');
  };

  return (
    <>
      <SectionTitle>{t('clients.profile.notes')}</SectionTitle>
      <Group className="gap-3 p-4">
        {notes.isPending ? (
          <Skeleton className="h-5 w-2/3" />
        ) : notes.isError ? (
          <View className="flex-row items-center justify-between gap-3">
            <Text className="flex-1 text-subtitle text-muted-foreground">
              {t('clients.profile.notesFailed')}
            </Text>
            <Button
              size="sm"
              variant="secondary"
              onPress={() => void notes.refetch()}
            >
              <Text>{t('common.retry')}</Text>
            </Button>
          </View>
        ) : notes.data.length === 0 ? (
          <Text className="text-title text-muted-foreground">
            {t('clients.profile.noNotes')}
          </Text>
        ) : (
          notes.data.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              onDelete={() => deleteNote.mutate(note.id)}
            />
          ))
        )}
        <InsetInput
          label={t('clients.profile.noteLabel', { name: firstName })}
          placeholder={t('clients.profile.notePlaceholder')}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submit}
          returnKeyType="done"
          trailing={
            <Button
              size="sm"
              className="h-9"
              onPress={submit}
              disabled={!draft.trim() || addNote.isPending}
              accessibilityLabel={t('clients.profile.addNote')}
            >
              <Text>{t('clients.profile.addNote')}</Text>
            </Button>
          }
        />
      </Group>
    </>
  );
}

function NoteRow({
  note,
  onDelete,
}: {
  note: ClientNoteRow;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const Glyph = KIND_ICON[note.kind as keyof typeof KIND_ICON] ?? StickyNote;
  const isWarning = note.kind === 'warning';
  return (
    <View className="flex-row items-start gap-3">
      <View className="mt-0.5">
        <Glyph
          size={20}
          strokeWidth={1.8}
          color={isWarning ? depth.colors.amber : depth.colors.secondary}
        />
      </View>
      <Text selectable className="min-w-0 flex-1 text-title">
        {note.body}
      </Text>
      <Pressable
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={t('clients.profile.deleteNote')}
        hitSlop={8}
        className="h-11 w-11 items-center justify-center active:opacity-50"
      >
        <X size={18} strokeWidth={2} color={depth.colors.secondary} />
      </Pressable>
    </View>
  );
}
