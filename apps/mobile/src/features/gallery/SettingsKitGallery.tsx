import {
  Avatar,
  Chip,
  ColorSwatches,
  DestructiveRow,
  Disclosure,
  GLYPHS,
  Group,
  GroupBlock,
  GroupRow,
  InlineInsetInput,
  SegmentedControl,
  Stepper,
  Switch,
  Text,
  TimeField,
  TimeWheel,
  TintLink,
  useDepth,
  type SystemColorKey,
} from '@booking/ui';
import { Plus } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { Row, Section, Specimen } from './Specimen';

const ROLES = [
  { value: 'staff', label: 'Staff' },
  { value: 'owner', label: 'Owner' },
] as const;

/** The controls the settings boards (Team, Hours, Services) need. */
export function SettingsKitGallery() {
  const [role, setRole] = React.useState<'staff' | 'owner'>('staff');
  const [resource, setResource] = React.useState('Chair');
  const [staff, setStaff] = React.useState(['Thandi']);
  const [more, setMore] = React.useState(false);
  const [minutes, setMinutes] = React.useState(60);
  const [time, setTime] = React.useState('08:00');
  const [wheelOpen, setWheelOpen] = React.useState(true);
  const [color, setColor] = React.useState<SystemColorKey>('orange');
  const [name, setName] = React.useState('Silk press');
  const [open, setOpen] = React.useState(true);
  const depth = useDepth();

  return (
    <>
      <Section
        title="Settings kit: choices"
        note="SegmentedControl choice, Chip choice and toggle"
      >
        <Specimen label="SegmentedControl variant=choice (Role)">
          <SegmentedControl
            variant="choice"
            label="Role"
            value={role}
            onChange={setRole}
            options={ROLES}
            className="w-[170px]"
          />
        </Specimen>
        <Specimen label="Chip variant=choice (radio, raised when off)">
          <Row>
            {['Chair', 'Barber chair', 'Nail station'].map((r) => (
              <Chip
                key={r}
                variant="choice"
                label={r}
                selected={resource === r}
                onPress={() => setResource(r)}
              />
            ))}
          </Row>
        </Specimen>
        <Specimen label="Chip variant=toggle with a colour dot (multi-select)">
          <Row>
            {[
              ['Thandi', '#007AFF'],
              ['Ruan', '#FF9500'],
              ['Aisha', '#AF52DE'],
            ].map(([n, dot]) => (
              <Chip
                key={n}
                variant="toggle"
                label={n}
                dotColor={dot}
                selected={staff.includes(n)}
                onPress={() =>
                  setStaff((cur) =>
                    cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n],
                  )
                }
              />
            ))}
          </Row>
        </Specimen>
        <Specimen label="ColorSwatches">
          <ColorSwatches
            value={color}
            onChange={setColor}
            labelFor={(k) => k}
          />
        </Specimen>
      </Section>

      <Section title="Settings kit: rows and fields">
        <Specimen label="Group radius=26 with GroupBlock rows, InlineInsetInput, Stepper">
          <Group radius={26} className="mx-0">
            <View className="min-h-14 flex-row items-center gap-3 px-4">
              <Text className="text-title">Name</Text>
              <InlineInsetInput
                label="Name"
                value={name}
                onChangeText={setName}
                containerClassName="flex-1"
              />
            </View>
            <GroupBlock showSeparator>
              <View className="min-h-14 flex-row items-center gap-3 px-4">
                <Text className="flex-1 text-title">Duration</Text>
                <Stepper
                  valueText={`${minutes} min`}
                  decrementLabel="Shorter"
                  incrementLabel="Longer"
                  onDecrement={() => setMinutes((m) => Math.max(15, m - 15))}
                  onIncrement={() => setMinutes((m) => Math.min(480, m + 15))}
                />
              </View>
            </GroupBlock>
            <GroupBlock showSeparator>
              <View className="min-h-14 flex-row items-center gap-2 px-4 py-2">
                <Text className="flex-1 text-title">Open</Text>
                <Switch
                  checked={open}
                  onCheckedChange={setOpen}
                  accessibilityLabel="Open"
                />
              </View>
            </GroupBlock>
          </Group>
        </Specimen>
        <Specimen label="GroupRow with a ringed avatar (64pt) and detail">
          <Group radius={22} className="mx-0">
            <GroupRow
              avatarName="Thandi Mokoena"
              avatarRing="#FF9500"
              title="Thandi Mokoena"
              subtitle="Senior stylist · Invite pending"
              onPress={() => {}}
            />
            <GroupRow
              showSeparator
              avatarName="Ruan van Wyk"
              avatarRing="#007AFF"
              title="Ruan van Wyk"
              subtitle="Barber"
              onPress={() => {}}
            />
          </Group>
        </Specimen>
        <Specimen label="Avatar: ring, hero (84pt), tint">
          <Row>
            <Avatar name="Thandi Mokoena" ring="#FF9500" />
            <Avatar name="Thandi Mokoena" ring="#AF52DE" size="hero" />
            <Avatar name="Ashgrove Hair" tone="tint" size="lg" />
          </Row>
        </Specimen>
        <Specimen label="TintLink variant=action, Disclosure">
          <TintLink
            variant="action"
            icon={Plus}
            label="Invite a team member"
            onPress={() => {}}
          />
          <Disclosure
            label="More"
            expanded={more}
            onPress={() => setMore((v) => !v)}
          />
        </Specimen>
      </Section>

      <Section title="Settings kit: glyph rows and destructive row">
        <Specimen label="GLYPHS (the Settings board's own line icons) in glyph rows">
          <Group radius={26} className="mx-0">
            {(Object.keys(GLYPHS) as (keyof typeof GLYPHS)[]).map((key, i) => (
              <GroupRow
                key={key}
                showSeparator={i > 0}
                icon={GLYPHS[key]}
                title={key}
                detail={key === 'team' ? '4' : undefined}
                onPress={() => {}}
              />
            ))}
          </Group>
        </Specimen>
        <Specimen label="DestructiveRow in a GroupBlock (Remove from team, Delete service)">
          <Group radius={26} className="mx-0">
            <GroupRow title="Calendar colour" subtitle={depth.scheme} />
            <GroupBlock showSeparator>
              <DestructiveRow label="Remove from team" onPress={() => {}} />
            </GroupBlock>
          </Group>
        </Specimen>
      </Section>

      <Section title="Settings kit: time">
        <Specimen label="TimeField (idle, active) and the inline TimeWheel">
          <Row>
            <TimeField
              value={time}
              label="Monday opens"
              active={wheelOpen}
              onPress={() => setWheelOpen((v) => !v)}
            />
            <Text className="text-title text-muted-foreground">-</Text>
            <TimeField value="17:00" label="Monday closes" onPress={() => {}} />
          </Row>
          {wheelOpen ? (
            <TimeWheel
              value={time}
              onChange={setTime}
              hourLabel={(h) => `Hour ${h}`}
              minuteLabel={(m) => `Minutes ${m}`}
            />
          ) : null}
        </Specimen>
      </Section>
    </>
  );
}
