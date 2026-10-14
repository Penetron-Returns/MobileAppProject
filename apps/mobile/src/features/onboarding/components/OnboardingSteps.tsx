import {
  AmountInsetField,
  Button,
  CheckPoint,
  ChoiceCard,
  FlowCaption,
  FlowHeading,
  InsetInput,
  LabeledInsetField,
  SuccessMark,
  Surface,
  SwitchRow,
  Text,
  useDepth,
} from '@booking/ui';
import {
  Brush,
  LayoutGrid,
  Scissors,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';

import {
  BUSINESS_TYPES,
  canAddTeamMember,
  hoursFor,
  servicesFor,
  summaryText,
  type BusinessTypeId,
  type DayGroupId,
  type OnboardingDraft,
} from '../logic';

const TYPE_ICONS: Record<BusinessTypeId, LucideIcon> = {
  barber: Scissors,
  salon: Brush,
  beauty: Sparkles,
  mix: LayoutGrid,
};

export interface StepActions {
  selectType: (id: BusinessTypeId) => void;
  setName: (name: string) => void;
  toggleDay: (id: DayGroupId) => void;
  toggleService: (name: string) => void;
  setPrice: (name: string, text: string) => void;
  addMember: (name: string, title: string) => void;
  removeMember: (index: number) => void;
}

interface StepProps {
  draft: OnboardingDraft;
  actions: StepActions;
}

export function TypeStep({ draft, actions }: StepProps) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Business type"
      className="gap-3 px-5"
    >
      {BUSINESS_TYPES.map((t) => (
        <ChoiceCard
          key={t.id}
          title={t.title}
          subtitle={t.subtitle}
          icon={TYPE_ICONS[t.id]}
          selected={draft.typeId === t.id}
          onPress={() => actions.selectType(t.id)}
        />
      ))}
    </View>
  );
}

export function HoursStep({ draft, actions }: StepProps) {
  return (
    <>
      <View className="mx-5">
        <LabeledInsetField
          label="Business name"
          value={draft.businessName}
          onChangeText={actions.setName}
          placeholder="Ashgrove Hair & Beauty"
          autoCapitalize="words"
          autoComplete="organization"
          maxLength={120}
          returnKeyType="done"
        />
      </View>
      <Text
        role="heading"
        aria-level="2"
        className="text-section mx-5 mb-1 mt-7 font-bold"
      >
        Opening hours
      </Text>
      <View className="px-5">
        {hoursFor(draft).map((h) => (
          <SwitchRow
            key={h.id}
            title={h.name}
            detail={h.value}
            checked={h.isOpen}
            onCheckedChange={() => actions.toggleDay(h.id)}
            switchLabel={`${h.name} open`}
          />
        ))}
      </View>
      <FlowCaption>
        Change exact times and special days later in Settings.
      </FlowCaption>
    </>
  );
}

export function ServicesStep({ draft, actions }: StepProps) {
  return (
    <>
      <View className="px-5">
        {servicesFor(draft).map((s) => (
          <SwitchRow
            key={s.name}
            title={s.name}
            detail={s.detail}
            checked={s.isOn}
            onCheckedChange={() => actions.toggleService(s.name)}
            switchLabel={`Offer ${s.name}`}
            minHeight={64}
            control={
              <AmountInsetField
                symbol="R"
                label={`Price for ${s.name} in rand`}
                value={s.priceText}
                onChangeText={(text) => actions.setPrice(s.name, text)}
              />
            }
          />
        ))}
      </View>
      <FlowCaption>
        Add your own services later in Settings. Prices are in rand.
      </FlowCaption>
    </>
  );
}

export function TeamStep({
  draft,
  actions,
  ownerName,
}: StepProps & { ownerName: string | null }) {
  const depth = useDepth();
  const [name, setName] = React.useState('');
  const [title, setTitle] = React.useState('');
  const canAdd = canAddTeamMember(draft.team, name);
  const add = () => {
    if (!canAdd) return;
    actions.addMember(name, title);
    setName('');
    setTitle('');
  };
  return (
    <>
      <View className="gap-2.5 px-5">
        <MemberRow name={ownerName?.trim() || 'You'} detail="You, the owner" />
        {draft.team.map((m, i) => (
          <MemberRow
            key={`${m.name}-${i}`}
            name={m.name}
            detail={m.title || undefined}
            onRemove={() => actions.removeMember(i)}
          />
        ))}
      </View>
      <View className="mt-5 gap-2.5 px-5">
        <InsetInput
          label="Team member name"
          placeholder="Name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          maxLength={120}
          radius={16}
          returnKeyType="next"
        />
        <InsetInput
          label="Team member role"
          placeholder="Role (optional)"
          value={title}
          onChangeText={setTitle}
          autoCapitalize="words"
          maxLength={80}
          radius={16}
          returnKeyType="done"
          onSubmitEditing={add}
        />
        <Button
          variant="secondary"
          size="lg"
          disabled={!canAdd}
          onPress={add}
          accessibilityLabel="Add team member"
        >
          <Text style={{ color: depth.colors.tint }}>Add team member</Text>
        </Button>
      </View>
      <FlowCaption>
        Team members get their own column in the calendar. Invite them to the
        app later in Settings.
      </FlowCaption>
    </>
  );
}

function MemberRow({
  name,
  detail,
  onRemove,
}: {
  name: string;
  detail?: string;
  onRemove?: () => void;
}) {
  const depth = useDepth();
  return (
    <Surface
      variant="raised"
      radius={20}
      className="min-h-14 flex-row items-center gap-3 px-4 py-2"
    >
      <View className="min-w-0 flex-1">
        <Text className="text-title">{name}</Text>
        {detail ? (
          <Text
            style={{ color: depth.colors.secondary }}
            className="text-subtitle"
          >
            {detail}
          </Text>
        ) : null}
      </View>
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${name}`}
          hitSlop={8}
          className="h-11 w-11 items-center justify-center"
        >
          <X size={20} strokeWidth={2.2} color={depth.colors.secondary} />
        </Pressable>
      ) : null}
    </Surface>
  );
}

export function DoneStep({ draft }: { draft: OnboardingDraft }) {
  const depth = useDepth();
  const services = servicesFor(draft).filter((s) => s.isOn).length;
  const open = hoursFor(draft).filter((h) => h.isOpen).length;
  return (
    <>
      <View className="items-center pt-7">
        <SuccessMark />
        <View className="mt-[18px] items-center px-10">
          <FlowHeading
            title="You are ready"
            subtitle={summaryText(draft)}
            align="center"
          />
        </View>
      </View>
      <Surface variant="raised" radius={26} className="mx-5 mt-7 gap-2.5 p-4">
        <Text
          style={{ color: depth.colors.secondary }}
          className="text-subtitle"
        >
          {draft.businessName.trim()} is set up with
        </Text>
        <CheckPoint
          text={`Opening hours on ${open} ${open === 1 ? 'day group' : 'day groups'}`}
        />
        <CheckPoint
          text={`${services} ${services === 1 ? 'service' : 'services'}`}
        />
        <CheckPoint
          text={
            draft.team.length
              ? `You and ${draft.team.length} team ${draft.team.length === 1 ? 'member' : 'members'}`
              : 'You as the first team member'
          }
        />
      </Surface>
      <Text
        style={{ color: depth.colors.secondary }}
        className="text-subtitle mx-5 mt-3"
      >
        Connect WhatsApp in Settings so clients can book in the chat they
        already use. Invite your team from Settings.
      </Text>
    </>
  );
}
