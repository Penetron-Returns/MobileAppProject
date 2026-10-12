import { AlertTriangle, Coffee, StickyNote } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ErrorState, LoadingRows } from '@/components/States';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';

import { useAddClientNote, useClientNotes } from '../hooks';

const KIND_ICON = {
  warning: { icon: AlertTriangle, className: 'text-status-pending' },
  preference: { icon: Coffee, className: 'text-primary' },
  general: { icon: StickyNote, className: 'text-muted-foreground' },
} as const;

function kindStyle(kind: string) {
  return KIND_ICON[kind as keyof typeof KIND_ICON] ?? KIND_ICON.general;
}

export function ClientNotesCard({ clientId }: { clientId: string }) {
  const { t } = useTranslation();
  const notes = useClientNotes(clientId);
  const [draft, setDraft] = React.useState('');
  const addNote = useAddClientNote(clientId);

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    addNote.mutate({ body });
    setDraft('');
  };

  return (
    <View className="bg-card border-border border-t-status-pending overflow-hidden rounded-2xl border border-t-4 p-5 shadow-sm">
      <View className="mb-3 flex-row items-center gap-2">
        <Icon as={AlertTriangle} size={20} className="text-status-pending" />
        <Text className="text-foreground text-lg font-bold">
          {t('clientProfile.notes')}
        </Text>
      </View>

      {notes.isPending ? (
        <LoadingRows count={2} />
      ) : notes.isError ? (
        <ErrorState error={notes.error} onRetry={() => void notes.refetch()} />
      ) : (
        <View className="gap-2.5">
          {notes.data.length === 0 ? (
            <Text className="text-muted-foreground text-sm">
              {t('clientProfile.noNotes')}
            </Text>
          ) : (
            notes.data.map((note) => {
              const style = kindStyle(note.kind);
              return (
                <View
                  key={note.id}
                  className="bg-muted/40 border-border flex-row gap-3 rounded-xl border p-3"
                >
                  <Icon as={style.icon} size={18} className={style.className} />
                  <Text className="text-foreground/90 flex-1 text-sm leading-5">
                    {note.body}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      )}

      <View className="mt-3 flex-row items-center gap-2">
        <Input
          value={draft}
          onChangeText={setDraft}
          placeholder={t('clientProfile.notePlaceholder')}
          onSubmitEditing={submit}
          className="flex-1"
        />
        <Button
          size="sm"
          onPress={submit}
          disabled={!draft.trim() || addNote.isPending}
        >
          <Text>{t('clientProfile.addNote')}</Text>
        </Button>
      </View>
    </View>
  );
}
