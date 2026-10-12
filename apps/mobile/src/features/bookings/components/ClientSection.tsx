import { Phone, User, X } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { PersonAvatar } from '@/components/PersonAvatar';
import { SearchInput } from '@/components/SearchInput';
import { LoadingRows } from '@/components/States';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useClientSearch, type ClientOption } from '@/features/clients/hooks';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';

export function ClientSection({
  mode,
  onModeChange,
  selected,
  onSelect,
  newName,
  onNewNameChange,
  newPhone,
  onNewPhoneChange,
}: {
  mode: 'existing' | 'new';
  onModeChange: (mode: 'existing' | 'new') => void;
  selected: ClientOption | null;
  onSelect: (client: ClientOption | null) => void;
  newName: string;
  onNewNameChange: (value: string) => void;
  newPhone: string;
  onNewPhoneChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="gap-2">
      <SectionLabel>{t('addBooking.client')}</SectionLabel>
      <View className="bg-muted flex-row rounded-lg p-1">
        {(['existing', 'new'] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => onModeChange(m)}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === m }}
            className={cn(
              'min-h-[36px] flex-1 items-center justify-center rounded-md py-2 active:opacity-80',
              mode === m && 'bg-card',
            )}
          >
            <Text
              className={cn(
                'text-xs font-bold uppercase tracking-wide',
                mode === m ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {t(`addBooking.clientMode.${m}`)}
            </Text>
          </Pressable>
        ))}
      </View>
      {mode === 'new' ? (
        <View className="gap-3">
          <IconInput
            icon={User}
            value={newName}
            onChangeText={onNewNameChange}
            placeholder={t('addBooking.newName')}
          />
          <IconInput
            icon={Phone}
            value={newPhone}
            onChangeText={onNewPhoneChange}
            placeholder={t('addBooking.newPhone')}
            keyboardType="phone-pad"
          />
        </View>
      ) : selected ? (
        <View className="border-primary/40 bg-primary/5 flex-row items-center justify-between rounded-xl border p-3">
          <View className="flex-row items-center gap-3">
            <PersonAvatar
              name={selected.name ?? selected.phone_e164}
              size="md"
            />
            <View>
              <Text className="text-foreground text-sm font-semibold">
                {selected.name ?? formatPhone(selected.phone_e164)}
              </Text>
              <Text className="text-muted-foreground text-xs">
                {formatPhone(selected.phone_e164)}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => onSelect(null)}
            accessibilityRole="button"
            accessibilityLabel={t('addBooking.changeClient')}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-accent"
          >
            <Icon as={X} size={16} className="text-muted-foreground" />
          </Pressable>
        </View>
      ) : (
        <ClientSearch onSelect={onSelect} />
      )}
    </View>
  );
}

function ClientSearch({
  onSelect,
}: {
  onSelect: (client: ClientOption) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = React.useState('');
  const results = useClientSearch(useDebouncedValue(query));
  return (
    <View className="gap-2">
      <SearchInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('addBooking.searchClient')}
      />
      {results.isPending ? (
        <LoadingRows count={2} />
      ) : results.data && results.data.length > 0 ? (
        <View className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
          {results.data.map((client, idx) => (
            <Pressable
              key={client.id}
              onPress={() => onSelect(client)}
              accessibilityRole="button"
              accessibilityLabel={t('addBooking.selectClient', {
                name: client.name ?? client.phone_e164,
              })}
              className={cn(
                'min-h-[44px] flex-row items-center justify-between p-3 active:bg-accent/50',
                idx < (results.data?.length ?? 0) - 1 &&
                  'border-border border-b',
              )}
            >
              <View className="flex-row items-center gap-2.5">
                <PersonAvatar
                  name={client.name ?? client.phone_e164}
                  size="sm"
                />
                <View>
                  <Text className="text-foreground text-sm font-medium">
                    {client.name ?? formatPhone(client.phone_e164)}
                  </Text>
                  <Text className="text-muted-foreground text-xs">
                    {formatPhone(client.phone_e164)}
                  </Text>
                </View>
              </View>
              <Text className="text-primary text-xs font-semibold">
                {t('addBooking.select')}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text className="text-muted-foreground px-1 text-sm">
          {t('addBooking.noClientMatch')}
        </Text>
      )}
    </View>
  );
}

function IconInput({
  icon,
  ...props
}: { icon: typeof User } & React.ComponentProps<typeof Input>) {
  return (
    <View className="border-border bg-card flex-row items-center rounded-lg border px-3">
      <Icon as={icon} size={18} className="text-muted-foreground mr-2.5" />
      <Input
        {...props}
        className="flex-1 border-0 bg-transparent px-0 shadow-none"
      />
    </View>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
      {children}
    </Text>
  );
}
