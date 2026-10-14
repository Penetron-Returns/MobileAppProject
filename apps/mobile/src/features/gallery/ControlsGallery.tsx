import { zodResolver } from '@hookform/resolvers/zod';
import {
  AmountInsetField,
  Avatar,
  Button,
  Capsule,
  ChoiceCard,
  Chip,
  Chips,
  FormField,
  Icon,
  IconButton,
  InsetInput,
  LabeledInsetField,
  SearchField,
  SegmentedControl,
  Switch,
  SwitchRow,
  Text,
  TintLink,
  type CapsuleTone,
} from '@booking/ui';
import { Bell, Calendar, Plus, Scissors, Send, Sun } from 'lucide-react-native';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';
import { z } from 'zod';

import { toast } from '@/lib/toast';

import { Row, Section, Specimen } from './Specimen';
import { SettingsKitGallery } from './SettingsKitGallery';

const BUTTON_VARIANTS = [
  'default',
  'secondary',
  'neutral',
  'outline',
  'outline-primary',
  'outline-destructive',
  'soft',
  'whatsapp',
  'ghost',
  'link',
  'destructive',
] as const;
const CAPSULE_TONES: CapsuleTone[] = ['neutral', 'amber', 'green', 'grey'];
const OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'recent', label: 'Recent' },
  { value: 'vip', label: 'VIP' },
] as const;
const demoSchema = z.object({
  name: z.string().min(2, 'Enter at least 2 characters'),
});

export function ControlsGallery() {
  const [segment, setSegment] = React.useState<'all' | 'recent' | 'vip'>('all');
  const [chip, setChip] = React.useState<'all' | 'recent' | 'vip'>('recent');
  const [time, setTime] = React.useState('10:30');
  const [on, setOn] = React.useState(true);
  const [off, setOff] = React.useState(false);
  const [choice, setChoice] = React.useState<'a' | 'b'>('a');
  const [text, setText] = React.useState('');
  const [search, setSearch] = React.useState('Zanele');
  const [amount, setAmount] = React.useState('250');
  const { control, handleSubmit } = useForm({
    resolver: zodResolver(demoSchema),
    defaultValues: { name: '' },
  });

  return (
    <>
      <Section title="Button" note="variant x size, plus loading and disabled">
        <Row>
          {BUTTON_VARIANTS.map((variant) => (
            <Button key={variant} variant={variant}>
              <Text>{variant}</Text>
            </Button>
          ))}
        </Row>
        <Row>
          {(['sm', 'default', 'lg', 'xl'] as const).map((size) => (
            <Button key={size} size={size}>
              <Text>{size}</Text>
            </Button>
          ))}
          <Button size="icon" accessibilityLabel="Calendar">
            <Icon as={Calendar} size={18} />
          </Button>
        </Row>
        <Row>
          <Button disabled>
            <Text>Disabled</Text>
          </Button>
          <Button loading size="lg">
            <Text>Saving</Text>
          </Button>
          <Button variant="secondary" loading size="lg">
            <Text>Loading</Text>
          </Button>
        </Row>
      </Section>

      <Section title="IconButton" note="Always labelled, 44pt to touch">
        <Row>
          <IconButton icon={Bell} label="Notifications" onPress={() => {}} />
          <IconButton
            icon={Bell}
            label="Notifications (small)"
            size="sm"
            onPress={() => {}}
          />
          <IconButton
            icon={Sun}
            label="Plain"
            variant="plain"
            onPress={() => {}}
          />
          <IconButton
            icon={Plus}
            label="Disabled"
            disabled
            onPress={() => {}}
          />
        </Row>
      </Section>

      <Section title="Inputs">
        <InsetInput
          label="Name"
          placeholder="InsetInput"
          value={text}
          onChangeText={setText}
        />
        <InsetInput
          label="Message"
          placeholder="With a trailing action"
          trailing={<Icon as={Send} size={18} className="text-primary" />}
        />
        <SearchField value={search} onChangeText={setSearch} />
        <SearchField
          clear="cancel"
          value={search}
          onChangeText={setSearch}
          placeholder="Search clients"
        />
        <LabeledInsetField label="Business name" defaultValue="Ashgrove" />
        <AmountInsetField
          symbol="R"
          label="Price"
          value={amount}
          onChangeText={setAmount}
        />
        <FormField
          control={control}
          name="name"
          label="FormField (react-hook-form + zod)"
          placeholder="Jane"
        />
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          onPress={handleSubmit(() => toast.success('Valid'))}
        >
          <Text>Validate the field</Text>
        </Button>
      </Section>

      <Section title="Switch and SwitchRow">
        <Row>
          <Switch
            checked={on}
            onCheckedChange={setOn}
            accessibilityLabel="On"
          />
          <Switch
            checked={off}
            onCheckedChange={setOff}
            accessibilityLabel="Off"
          />
          <Switch
            checked
            disabled
            onCheckedChange={() => {}}
            accessibilityLabel="Disabled"
          />
        </Row>
        <Specimen label="variant=flat">
          <SwitchRow
            title="Open on Mondays"
            detail="09:00 to 17:00"
            checked={on}
            onCheckedChange={setOn}
          />
        </Specimen>
        <Specimen label="variant=card">
          <SwitchRow
            variant="card"
            title="Tell Zanele on WhatsApp"
            checked={off}
            onCheckedChange={setOff}
          />
        </Specimen>
      </Section>

      <Section title="SegmentedControl, Chips and Chip">
        <SegmentedControl
          label="Filter"
          value={segment}
          onChange={setSegment}
          options={OPTIONS}
        />
        <Specimen label="Chips (filter)">
          <Chips
            label="Filter"
            value={chip}
            onChange={setChip}
            options={OPTIONS}
          />
        </Specimen>
        <Specimen label="Chip variant=time">
          <Row>
            {['10:00', '10:30', '11:00'].map((t) => (
              <Chip
                key={t}
                label={t}
                selected={time === t}
                onPress={() => setTime(t)}
              />
            ))}
          </Row>
        </Specimen>
      </Section>

      <Section title="ChoiceCard">
        <View accessibilityRole="radiogroup" className="gap-2">
          <ChoiceCard
            icon={Scissors}
            title="Hair salon"
            subtitle="Cuts, colour, styling"
            selected={choice === 'a'}
            onPress={() => setChoice('a')}
          />
          <ChoiceCard
            title="Barber"
            selected={choice === 'b'}
            onPress={() => setChoice('b')}
          />
        </View>
      </Section>

      <Section title="Capsule and Avatar">
        <Row>
          {CAPSULE_TONES.map((tone) => (
            <Capsule key={tone} tone={tone} label={tone} />
          ))}
        </Row>
        <Row>
          {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
            <Avatar key={size} size={size} name="Zanele Mthembu" />
          ))}
          <Avatar name={null} />
        </Row>
      </Section>

      <Section title="TintLink">
        <TintLink label="Add a service" icon={Plus} onPress={() => {}} />
      </Section>

      <SettingsKitGallery />
    </>
  );
}
