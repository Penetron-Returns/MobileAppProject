import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  CheckPoint,
  ConfirmDialog,
  DayChips,
  DoneCard,
  Group,
  GroupField,
  GroupRow,
  IconDome,
  OptionSheet,
  SectionTitle,
  SlotSkeleton,
  SuccessMark,
  Text,
  TimeChips,
  showToast,
  type SlotDay,
  type SlotTime,
} from '@booking/ui';
import { Building2, Clock, Inbox, MessageCircle } from 'lucide-react-native';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';
import { z } from 'zod';

import { Row, Section, Specimen } from './Specimen';

const DAYS: SlotDay[] = [
  {
    value: '2026-10-14',
    weekday: 'Wed',
    day: '14',
    accessibilityLabel: 'Wednesday 14 October',
  },
  {
    value: '2026-10-15',
    weekday: 'Thu',
    day: '15',
    accessibilityLabel: 'Thursday 15 October',
  },
  {
    value: '2026-10-16',
    weekday: 'Fri',
    day: '16',
    accessibilityLabel: 'Friday 16 October',
  },
  {
    value: '2026-10-17',
    weekday: 'Sat',
    day: '17',
    accessibilityLabel: 'Saturday 17 October',
  },
];
const TIMES: SlotTime[] = ['10:00', '10:30', '11:00', '11:30'].map((t) => ({
  value: t,
  label: t,
}));
const SHEET_OPTIONS = [
  { value: 'zar', label: 'South African rand', description: 'ZAR' },
  { value: 'usd', label: 'US dollar', description: 'USD' },
  { value: 'eur', label: 'Euro' },
];
const schema = z.object({
  name: z.string().min(2, 'Enter at least 2 characters'),
});

/** Rows and groups, form rows, sheets, dialogs, toasts, slot picking and done states. */
export function SurfacesGallery() {
  const [day, setDay] = React.useState<string | null>('2026-10-14');
  const [time, setTime] = React.useState<string | null>('10:30');
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [sheetValue, setSheetValue] = React.useState<string | null>('zar');
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const { control } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '' },
  });

  return (
    <>
      <Section title="SectionTitle, Group and GroupRow">
        <Specimen label="Rows with a glyph, detail, subtitle, switch-free">
          <Group className="mx-0">
            <GroupRow
              icon={Building2}
              title="Business details"
              detail="Ashgrove"
              onPress={() => {}}
            />
            <GroupRow
              icon={Clock}
              showSeparator
              title="Hours"
              detail="Mon to Sat"
              onPress={() => {}}
            />
            <GroupRow
              icon={MessageCircle}
              showSeparator
              title="WhatsApp"
              detail="Connected"
              detailTone="success"
              onPress={() => {}}
            />
            <GroupRow
              showSeparator
              title="Sign out"
              destructive
              onPress={() => {}}
            />
          </Group>
        </Specimen>
        <Specimen label="Avatar rows">
          <Group className="mx-0">
            <GroupRow
              avatarName="Thandi Mokoena"
              title="Thandi Mokoena"
              subtitle="Senior stylist"
              onPress={() => {}}
            />
            <GroupRow
              avatarName="Ruan van Wyk"
              showSeparator
              title="Ruan van Wyk"
              subtitle="Barber · Paused"
              onPress={() => {}}
            />
          </Group>
        </Specimen>
        <SectionTitle className="mx-0 mt-2">Section title</SectionTitle>
      </Section>

      <Section
        title="GroupField"
        note="Label above a borderless field, error below"
      >
        <Group className="mx-0">
          <GroupField control={control} name="name" label="Business name" />
          <GroupField
            control={control}
            name="name"
            label="Address"
            showSeparator
            multiline
          />
        </Group>
      </Section>

      <Section title="Sheets and dialogs">
        <Row>
          <Button
            variant="outline"
            size="sm"
            onPress={() => setSheetOpen(true)}
          >
            <Text>OptionSheet</Text>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onPress={() => setConfirmOpen(true)}
          >
            <Text>ConfirmDialog</Text>
          </Button>
        </Row>
        <OptionSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title="Currency"
          options={SHEET_OPTIONS}
          selected={sheetValue}
          onSelect={setSheetValue}
        />
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Cancel this booking?"
          description="The client will be told on WhatsApp."
          confirmLabel="Cancel booking"
          destructive
          onConfirm={() => setConfirmOpen(false)}
        />
      </Section>

      <Section title="Toast" note="Queue is shown at the top of the screen">
        <Row>
          <Button
            size="sm"
            variant="outline"
            onPress={() => showToast({ kind: 'success', title: 'Saved' })}
          >
            <Text>Success</Text>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onPress={() =>
              showToast({ kind: 'info', title: 'No notifications yet' })
            }
          >
            <Text>Info</Text>
          </Button>
          <Button
            size="sm"
            variant="outline-destructive"
            onPress={() =>
              showToast({
                kind: 'error',
                title: 'Could not save',
                description: 'Check your connection.',
                requestId: 'req_demo123',
              })
            }
          >
            <Text>Error</Text>
          </Button>
        </Row>
      </Section>

      <Section
        title="Slot picker kit"
        note="DayChips, TimeChips and SlotSkeleton"
      >
        <DayChips days={DAYS} selected={day} onSelect={setDay} label="Days" />
        <TimeChips
          times={TIMES}
          selected={time}
          onSelect={setTime}
          label="Times"
        />
        <SlotSkeleton label="Loading availability" />
      </Section>

      <Section title="Done states and domes">
        <View className="-mx-5">
          <DoneCard
            title="Booked"
            lines={[
              'Zanele Mthembu, Wed 14 Oct, 10:30',
              'Zanele was told on WhatsApp',
            ]}
          />
          <DoneCard
            variant="solid"
            title="You are all set"
            lines={['Go to Today']}
          />
        </View>
        <View className="items-center gap-3">
          <SuccessMark size={64} />
          <CheckPoint text="Share your booking link on WhatsApp" />
        </View>
        <Row>
          <IconDome icon={Inbox} />
          <IconDome icon={Inbox} size="lg" />
        </Row>
      </Section>
    </>
  );
}
