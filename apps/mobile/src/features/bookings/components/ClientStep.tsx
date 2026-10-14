import { Check } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { SearchInput } from '@/components/SearchInput';
import { Surface } from '@/components/Surface';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import type { ServiceRow } from '@/features/catalog/hooks';
import { useClientSearch, type ClientOption } from '@/features/clients/hooks';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useDepth } from '@/hooks/useDepth';
import { formatDuration, formatMoney, formatPhone } from '@/lib/format';

export interface ClientChoice {
  mode: 'existing' | 'new';
  client: ClientOption | null;
  newName: string;
  newPhone: string;
}

function Row({
  title,
  subtitle,
  selected,
  showSeparator,
  onPress,
  label,
}: {
  title: string;
  subtitle?: string;
  selected: boolean;
  showSeparator: boolean;
  onPress: () => void;
  label: string;
}) {
  const depth = useDepth();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      className="min-h-14 flex-row items-center gap-3 px-4 py-1.5 active:bg-muted"
    >
      {showSeparator ? (
        <Surface
          variant="engrave"
          className="absolute left-4 right-0 top-0 h-0.5"
        />
      ) : null}
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-title">
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            className="text-subtitle text-muted-foreground"
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {selected ? (
        <Check size={20} strokeWidth={2.6} color={depth.colors.tint} />
      ) : null}
    </Pressable>
  );
}

/** Step 1: who (search, or add them) and what (the service). */
export function ClientStep({
  choice,
  onChoice,
  services,
  serviceId,
  onService,
  currency,
}: {
  choice: ClientChoice;
  onChoice: (choice: ClientChoice) => void;
  services: ServiceRow[];
  serviceId: string | null;
  onService: (id: string) => void;
  currency: string;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = React.useState('');
  const search = useClientSearch(useDebouncedValue(query));
  const isNew = choice.mode === 'new';

  return (
    <View className="gap-5">
      <View className="gap-2">
        <Text role="heading" aria-level="2" className="text-section font-bold">
          {t('newBooking.who')}
        </Text>
        <SearchInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('newBooking.searchPlaceholder')}
        />
        <Surface variant="raised" className="overflow-hidden py-1">
          {search.isPending ? (
            <View className="gap-3 p-4">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-1/2" />
            </View>
          ) : search.isError ? (
            <Text className="p-4 text-subtitle text-muted-foreground">
              {t('newBooking.searchFailed')}
            </Text>
          ) : search.data.length === 0 ? (
            <Text className="p-4 text-subtitle text-muted-foreground">
              {t('newBooking.noMatch')}
            </Text>
          ) : (
            search.data.map((c, index) => (
              <Row
                key={c.id}
                title={c.name ?? formatPhone(c.phone_e164)}
                subtitle={c.name ? formatPhone(c.phone_e164) : undefined}
                selected={!isNew && choice.client?.id === c.id}
                showSeparator={index > 0}
                label={t('newBooking.selectClient', {
                  name: c.name ?? formatPhone(c.phone_e164),
                })}
                onPress={() =>
                  onChoice({ ...choice, mode: 'existing', client: c })
                }
              />
            ))
          )}
          <Row
            title={t('newBooking.newClient')}
            selected={isNew}
            showSeparator
            label={t('newBooking.newClient')}
            onPress={() =>
              onChoice({ ...choice, mode: isNew ? 'existing' : 'new' })
            }
          />
        </Surface>
        {isNew ? (
          <View className="gap-2">
            <Input
              value={choice.newName}
              onChangeText={(newName) => onChoice({ ...choice, newName })}
              placeholder={t('newBooking.namePlaceholder')}
              accessibilityLabel={t('newBooking.name')}
              autoCapitalize="words"
            />
            <Input
              value={choice.newPhone}
              onChangeText={(newPhone) => onChoice({ ...choice, newPhone })}
              placeholder={t('newBooking.phonePlaceholder')}
              accessibilityLabel={t('newBooking.phone')}
              keyboardType="phone-pad"
            />
          </View>
        ) : null}
      </View>

      <View className="gap-2">
        <Text role="heading" aria-level="2" className="text-section font-bold">
          {t('newBooking.service')}
        </Text>
        <Surface variant="raised" className="overflow-hidden py-1">
          {services.length === 0 ? (
            <Text className="p-4 text-subtitle text-muted-foreground">
              {t('newBooking.noServices')}
            </Text>
          ) : (
            services.map((s, index) => (
              <Row
                key={s.id}
                title={s.name}
                subtitle={`${formatDuration(s.duration_minutes)} · ${formatMoney(s.price_cents, currency)}`}
                selected={serviceId === s.id}
                showSeparator={index > 0}
                label={s.name}
                onPress={() => onService(s.id)}
              />
            ))
          )}
        </Surface>
      </View>
    </View>
  );
}
