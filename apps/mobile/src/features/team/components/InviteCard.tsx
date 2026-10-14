import { Button, InsetInput, Surface, Text } from '@booking/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useCreateInvitation } from '../hooks';
import { inviteSchema, type InviteValues } from '../logic';

/**
 * The invite card of the Team board: "Their email address", the hint about the
 * email invite and a primary "Send invite". Email only: the owner's API sends
 * the invitation and the person joins by signing in with that address.
 * `staffId` links the login to an existing calendar person.
 */
export function InviteCard({
  staffId,
  defaultEmail,
  onSent,
}: {
  staffId?: string | null;
  defaultEmail?: string | null;
  onSent: (email: string) => void;
}) {
  const { t } = useTranslation();
  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema(t)),
    defaultValues: { email: defaultEmail ?? '' },
  });
  const invite = useCreateInvitation({
    onSuccess: ({ email }) => {
      form.reset({ email: '' });
      onSent(email);
    },
  });
  const error = form.formState.errors.email?.message;
  const submit = form.handleSubmit(({ email }) =>
    invite.mutate({ email, role: 'staff', staffId }),
  );

  return (
    <Surface variant="raised" radius={26} className="mx-5 mt-1 p-4">
      <Text className="text-subtitle text-muted-foreground">
        {t('team.invite.emailLabel')}
      </Text>
      <Controller
        control={form.control}
        name="email"
        render={({ field }) => (
          <InsetInput
            label={t('team.invite.emailLabel')}
            placeholder={t('team.invite.emailPlaceholder')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            editable={!invite.isPending}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={() => void submit()}
            radius={14}
            containerClassName="mt-1.5 h-12 px-3.5"
          />
        )}
      />
      {error ? (
        <Text
          accessibilityRole="alert"
          className="mt-1.5 text-subtitle text-destructive"
        >
          {error}
        </Text>
      ) : (
        <Text className="mt-1.5 text-subtitle text-muted-foreground">
          {t('team.invite.hint')}
        </Text>
      )}
      <View className="mt-3">
        <Button
          size="lg"
          className="w-full"
          onPress={() => void submit()}
          loading={invite.isPending}
          accessibilityLabel={t('team.invite.send')}
        >
          <Text>{t('team.invite.send')}</Text>
        </Button>
      </View>
    </Surface>
  );
}
