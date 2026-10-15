import { Avatar, Button, InsetInput, Text, useDepth } from '@booking/ui';
import { useUser } from '@clerk/expo';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthBackdrop } from '@/features/auth/components/AuthBackdrop';
import { toast } from '@/lib/toast';

import { useAcceptInvitation, type PendingInvitation } from '../hooks';
import { needsName, validateName } from '../name';

/**
 * Shown to a signed-in person with no business who has been invited to one:
 * "You've been invited to {business}" with Join, and a quieter way to create
 * their own business instead. Styled like the sign-in and onboarding boards.
 */
export function JoinScreen({
  invitations,
  onDecline,
}: {
  invitations: PendingInvitation[];
  onDecline: () => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const insets = useSafeAreaInsets();
  const accept = useAcceptInvitation();
  const [first, ...others] = invitations;
  const { user } = useUser();
  const [joiningId, setJoiningId] = React.useState<string | null>(null);
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [nameError, setNameError] = React.useState(false);
  // Asked once: a name Clerk already has (or that was just saved) is not asked again.
  const asksName = Boolean(user) && needsName(user?.firstName);

  if (!first) return null;
  const join = (invitation: PendingInvitation) => {
    let name;
    if (asksName) {
      const result = validateName({ firstName, lastName });
      if (!result.ok) {
        setNameError(true);
        return;
      }
      name = result.name;
    }
    setJoiningId(invitation.id);
    accept.mutate(
      { invitation, name },
      { onError: () => toast.failed(t('join.failed')) },
    );
  };
  const busy = accept.isPending;

  return (
    <AuthBackdrop>
      <ScrollView
        contentContainerClassName="grow justify-between"
        contentContainerStyle={{
          paddingTop: Math.max(insets.top + 56, 112),
          paddingBottom: insets.bottom + 34,
        }}
      >
        <View className="items-center">
          <Avatar
            name={first.organizationName}
            imageUrl={first.imageUrl}
            tone="tint"
            size="xl"
          />
          <Text
            style={{ color: depth.colors.secondary }}
            className="mt-3.5 text-title font-semibold"
          >
            {t('auth.appName')}
          </Text>
          <Text
            role="heading"
            aria-level="1"
            className="mx-9 mt-7 text-center text-large-title font-bold"
          >
            {t('join.headline', { business: first.organizationName })}
          </Text>
          <Text
            style={{ color: depth.colors.secondary }}
            className="mx-12 mt-2.5 text-center text-title"
          >
            {t('join.subtitle')}
          </Text>
        </View>

        <View className="mt-10 gap-3 px-6">
          {asksName ? (
            <View className="gap-2">
              <Text
                role="heading"
                aria-level="2"
                className="text-title font-semibold"
              >
                {t('join.name.title')}
              </Text>
              <Text
                style={{ color: depth.colors.secondary }}
                className="text-subtitle"
              >
                {t('join.name.hint')}
              </Text>
              <InsetInput
                label={t('join.name.firstName')}
                placeholder={t('join.name.firstName')}
                value={firstName}
                onChangeText={(v) => {
                  setFirstName(v);
                  setNameError(false);
                }}
                editable={!busy}
                autoComplete="given-name"
                textContentType="givenName"
                autoCapitalize="words"
                returnKeyType="next"
                radius={16}
                containerClassName="min-h-14"
              />
              <InsetInput
                label={t('join.name.lastName')}
                placeholder={t('join.name.lastName')}
                value={lastName}
                onChangeText={setLastName}
                editable={!busy}
                autoComplete="family-name"
                textContentType="familyName"
                autoCapitalize="words"
                returnKeyType="done"
                radius={16}
                containerClassName="min-h-14"
              />
              {nameError ? (
                <Text
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  style={{ color: depth.colors.destructiveText }}
                  className="text-subtitle"
                >
                  {t('join.name.firstNameRequired')}
                </Text>
              ) : null}
            </View>
          ) : null}
          <Button
            size="xl"
            onPress={() => join(first)}
            loading={busy && joiningId === first.id}
            disabled={busy}
            accessibilityLabel={t('join.joinNamed', {
              business: first.organizationName,
            })}
          >
            <Text>{t('join.join')}</Text>
          </Button>
          {others.map((invitation) => (
            <Button
              key={invitation.id}
              size="xl"
              variant="neutral"
              onPress={() => join(invitation)}
              loading={busy && joiningId === invitation.id}
              disabled={busy}
              accessibilityLabel={t('join.joinNamed', {
                business: invitation.organizationName,
              })}
            >
              <Text>
                {t('join.joinNamed', { business: invitation.organizationName })}
              </Text>
            </Button>
          ))}
          <Button
            size="xl"
            variant="secondary"
            onPress={onDecline}
            disabled={busy}
            accessibilityLabel={t('join.createOwn')}
          >
            <Text>{t('join.createOwn')}</Text>
          </Button>
        </View>
      </ScrollView>
    </AuthBackdrop>
  );
}
