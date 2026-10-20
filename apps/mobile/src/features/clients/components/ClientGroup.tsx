import {
  Avatar,
  RADII,
  RowContextMenu,
  Surface,
  Text,
  useDepth,
  useRowActionProps,
} from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import type { ISODate } from '@/lib/time';

import { clientMenuActions } from '../menuActions';
import { visitSubtitle, type BookRow } from '../phoneBook';

/** Resting row height: the phone book's `getItemLayout` relies on it at the default text size. */
export const ROW_HEIGHT = 70;
/** Clear space under the last row of a group, before the next letter. */
export const GROUP_GAP = 12;
/** Board margins: 20pt left, 36pt right (clear of the index strip). Inline styles: the right-side spacing classes were dropped on Android. */
export const GROUP_MARGIN = { marginLeft: 20, marginRight: 36 } as const;

interface ClientListRowProps {
  row: BookRow;
  today: ISODate;
  onOpen: (id: string) => void;
  isFirst: boolean;
  isLast: boolean;
}

/**
 * One client, as one item of the flat list. Neighbouring rows join into the
 * raised group of the board: the first rounds its top, the last its bottom.
 * Rows grow with the text size rather than clip.
 */
export const ClientListRow = React.memo(function ClientListRow({
  row,
  today,
  onOpen,
  isFirst,
  isLast,
}: ClientListRowProps) {
  const depth = useDepth();
  const edge = {
    borderColor: depth.colors.hairline,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderTopWidth: isFirst ? StyleSheet.hairlineWidth : 0,
    borderBottomWidth: isLast ? StyleSheet.hairlineWidth : 0,
    borderTopLeftRadius: isFirst ? RADII.raised : 0,
    borderTopRightRadius: isFirst ? RADII.raised : 0,
    borderBottomLeftRadius: isLast ? RADII.raised : 0,
    borderBottomRightRadius: isLast ? RADII.raised : 0,
  } as const;
  return (
    <View style={{ paddingBottom: isLast ? GROUP_GAP : 0 }}>
      <View style={[GROUP_MARGIN, edge, { overflow: 'hidden' }]}>
        <ClientBookRow
          row={row}
          today={today}
          onOpen={onOpen}
          showSeparator={!isFirst}
        />
      </View>
    </View>
  );
});

/** Text starts after 16pt padding + avatar + 12pt gap, measured on device. */
const SEPARATOR_INSET = 67;

/** iOS Contacts style: a thin line from after the avatar to the group edge. */
function Hairline({ color }: { color: string }) {
  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        top: 0,
        left: SEPARATOR_INSET,
        right: 0,
        height: StyleSheet.hairlineWidth,
        backgroundColor: color,
      }}
    />
  );
}

interface ClientBookRowProps {
  row: BookRow;
  today: ISODate;
  onOpen: (id: string) => void;
  showSeparator: boolean;
}

function ClientBookRow(props: ClientBookRowProps) {
  const { t } = useTranslation();
  const { row } = props;
  // Built only for rows that are mounted, i.e. on screen (the list is virtualised).
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
}

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
      // The layout lives on an inner View: a Pressable style is dropped on Android here.
    >
      {({ pressed }) => (
        <View
          style={{
            minHeight: ROW_HEIGHT,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 12,
            backgroundColor: depth.colors.groupRow,
            opacity: pressed ? 0.6 : 1,
          }}
        >
          {showSeparator ? <Hairline color={depth.engraveLine} /> : null}
          <Avatar name={row.name} />
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-title">
              {row.name}
            </Text>
            <Text
              numberOfLines={1}
              style={{ marginTop: 3 }}
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
        </View>
      )}
    </Pressable>
  );
}
