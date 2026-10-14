import {
  Button,
  FlowCaption,
  InsetInput,
  Surface,
  Text,
  useDepth,
} from '@booking/ui';
import { X } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { canAddTeamMember } from '../logic';
import { StepProps } from './OnboardingSteps';

export function TeamStep({
  draft,
  actions,
  ownerName,
}: StepProps & { ownerName: string | null }) {
  const { t } = useTranslation();
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
        <MemberRow
          name={ownerName?.trim() || t('onboarding.team.you')}
          detail={t('onboarding.team.youOwner')}
        />
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
          label={t('onboarding.team.nameLabel')}
          placeholder={t('onboarding.team.namePlaceholder')}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          maxLength={120}
          radius={16}
          returnKeyType="next"
        />
        <InsetInput
          label={t('onboarding.team.roleLabel')}
          placeholder={t('onboarding.team.rolePlaceholder')}
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
          accessibilityLabel={t('onboarding.team.add')}
        >
          <Text style={{ color: depth.colors.tint }}>
            {t('onboarding.team.add')}
          </Text>
        </Button>
      </View>
      <FlowCaption>{t('onboarding.team.caption')}</FlowCaption>
    </>
  );
}

export function MemberRow({
  name,
  detail,
  onRemove,
}: {
  name: string;
  detail?: string;
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
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
          accessibilityLabel={t('onboarding.team.remove', { name })}
          hitSlop={8}
          className="h-11 w-11 items-center justify-center"
        >
          <X size={20} strokeWidth={2.2} color={depth.colors.secondary} />
        </Pressable>
      ) : null}
    </Surface>
  );
}
