import {
  Avatar,
  Divider,
  RowContextMenu,
  Surface,
  Text,
  useDepth,
  useRowActionProps,
} from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { clientMenuActions } from '../menuActions';
import { visitSubtitle, type BookRow } from '../phoneBook';
import type { ISODate } from '@/lib/time';

/** Fixed row height: the phone book's `getItemLayout` relies on it. */
export const ROW_HEIGHT = 60;
/** Row text stops growing here so two lines always fit the fixed height. */
const MAX_FONT_SCALE = 1.1;

interface ClientGroupProps {
  rows: BookRow[];
  today: ISODate;
  onOpen: (id: string) => void;
}

/** One letter's clients: a raised group of rows (36pt clear on the right for the index). */
export const ClientGroup = React.memo(function ClientGroup({
  rows,
  today,
  onOpen,
}: ClientGroupProps) {
  return (
    <View className="pb-3">
      <Surface variant="raised" className="ml-5 mr-9 overflow-hidden">
        {rows.map((row, index) => (
          <ClientBookRow
            key={row.id}
            row={row}
            today={today}
            onOpen={onOpen}
            showSeparator={index > 0}
          />
        ))}
      </Surface>
    </View>
  );
});

interface ClientBookRowProps {
  row: BookRow;
  today: ISODate;
  onOpen: (id: string) => void;
  showSeparator: boolean;
}

const ClientBookRow = React.memo(function ClientBookRow(
  props: ClientBookRowProps,
) {
  const { t } = useTranslation();
  const { row } = props;
  const actions = React.useMemo(
    () =>
      clientMenuActions(
        { id: row.id, name: row.name, phone_e164: row.phone },
        row.name,
        t,
      ),
    [row, t],
  );
  return (
    <RowContextMenu actions={actions}>
      <ClientRowBody {...props} />
    </RowContextMenu>
  );
});

function ClientRowBody({
  row,
  today,
  onOpen,
  showSeparator,
}: ClientBookRowProps) {
  const { t } = useTranslation();
  const depth = useDepth();
  const rowActions = useRowActionProps();
  const subtitle = visitSubtitle(row.visit, today, {
    today: t('clients.today'),
    noVisits: t('clients.noVisits'),
  });
  const spoken = row.visit
    ? t('clients.rowLabel', { name: row.name, when: subtitle })
    : t('clients.rowLabelNone', { name: row.name });
  return (
    <Pressable
      onPress={() => onOpen(row.id)}
      {...rowActions}
      accessibilityRole="button"
      accessibilityLabel={
        row.isVip ? t('clients.rowLabelVip', { label: spoken }) : spoken
      }
      style={({ pressed }) => ({
        height: ROW_HEIGHT,
        backgroundColor: depth.colors.groupRow,
        opacity: pressed ? 0.6 : 1,
      })}
      className="flex-row items-center gap-3 px-4"
    >
      {showSeparator ? <Divider inset={0} /> : null}
      <Avatar name={row.name} />
      <View className="min-w-0 flex-1">
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          className="text-title"
        >
          {row.name}
        </Text>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          className="text-subtitle text-muted-foreground"
        >
          {subtitle}
        </Text>
      </View>
      {row.isVip ? (
        <Surface
          variant="vipCapsule"
          radius={10}
          importantForAccessibility="no-hide-descendants"
          className="px-2 py-0.5"
        >
          <Text className="text-meta font-semibold text-muted-foreground">
            {t('clients.vip')}
          </Text>
        </Surface>
      ) : null}
    </Pressable>
  );
}
