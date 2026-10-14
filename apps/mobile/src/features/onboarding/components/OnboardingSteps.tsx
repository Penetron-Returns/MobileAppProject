import {
  AmountInsetField,
  CheckPoint,
  ChoiceCard,
  FlowCaption,
  FlowHeading,
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
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import {
  BUSINESS_TYPE_IDS,
  hoursFor,
  servicesFor,
  summaryFacts,
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

export interface StepProps {
  draft: OnboardingDraft;
  actions: StepActions;
}

export function TypeStep({ draft, actions }: StepProps) {
  const { t } = useTranslation();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('onboarding.typeLabel')}
      className="gap-3 px-5"
    >
      {BUSINESS_TYPE_IDS.map((id) => (
        <ChoiceCard
          key={id}
          title={t(`onboarding.types.${id}.title`)}
          subtitle={t(`onboarding.types.${id}.subtitle`)}
          icon={TYPE_ICONS[id]}
          selected={draft.typeId === id}
          onPress={() => actions.selectType(id)}
        />
      ))}
    </View>
  );
}

export function HoursStep({ draft, actions }: StepProps) {
  const { t } = useTranslation();
  return (
    <>
      <View className="mx-5">
        <LabeledInsetField
          label={t('onboarding.hours.nameLabel')}
          value={draft.businessName}
          onChangeText={actions.setName}
          placeholder={t('onboarding.hours.namePlaceholder')}
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
        {t('onboarding.hours.heading')}
      </Text>
      <View className="px-5">
        {hoursFor(draft).map((h) => (
          <SwitchRow
            key={h.id}
            title={t(`onboarding.hours.days.${h.id}`)}
            detail={
              h.isOpen
                ? t('onboarding.hours.range', {
                    opens: h.opens,
                    closes: h.closes,
                  })
                : t('onboarding.hours.closed')
            }
            checked={h.isOpen}
            onCheckedChange={() => actions.toggleDay(h.id)}
            switchLabel={t('onboarding.hours.dayOpen', {
              day: t(`onboarding.hours.days.${h.id}`),
            })}
          />
        ))}
      </View>
      <FlowCaption>{t('onboarding.hours.caption')}</FlowCaption>
    </>
  );
}

export function ServicesStep({ draft, actions }: StepProps) {
  const { t } = useTranslation();
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
            switchLabel={t('onboarding.services.offer', { name: s.name })}
            minHeight={64}
            control={
              <AmountInsetField
                symbol="R"
                label={t('onboarding.services.price', { name: s.name })}
                value={s.priceText}
                onChangeText={(text) => actions.setPrice(s.name, text)}
              />
            }
          />
        ))}
      </View>
      <FlowCaption>{t('onboarding.services.caption')}</FlowCaption>
    </>
  );
}

export function DoneStep({ draft }: { draft: OnboardingDraft }) {
  const { t } = useTranslation();
  const depth = useDepth();
  const { typeId, serviceCount: services } = summaryFacts(draft);
  const open = hoursFor(draft).filter((h) => h.isOpen).length;
  return (
    <>
      <View className="items-center pt-7">
        <SuccessMark />
        <View className="mt-[18px] items-center px-10">
          <FlowHeading
            title={t('onboarding.done.title')}
            subtitle={t('onboarding.done.summary', {
              noun: t(`onboarding.types.${typeId}.noun`),
              services: t('onboarding.done.services', { count: services }),
            })}
            align="center"
          />
        </View>
      </View>
      <Surface variant="raised" radius={26} className="mx-5 mt-7 gap-2.5 p-4">
        <Text
          style={{ color: depth.colors.secondary }}
          className="text-subtitle"
        >
          {t('onboarding.done.setUp', { name: draft.businessName.trim() })}
        </Text>
        <CheckPoint text={t('onboarding.done.hours', { count: open })} />
        <CheckPoint text={t('onboarding.done.services', { count: services })} />
        <CheckPoint
          text={
            draft.team.length
              ? t('onboarding.done.team', { count: draft.team.length })
              : t('onboarding.done.teamNone')
          }
        />
      </Surface>
      <Text
        style={{ color: depth.colors.secondary }}
        className="text-subtitle mx-5 mt-3"
      >
        {t('onboarding.done.whatsapp')}
      </Text>
    </>
  );
}
