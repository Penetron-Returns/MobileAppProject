import {
  Button,
  ConfirmDialog,
  Group,
  InsetInput,
  ListSkeleton,
  Page,
  SectionTitle,
  Text,
} from '@booking/ui';
import { router } from 'expo-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import {
  useAccountDeletionPreview,
  useDeleteAccount,
  useTypedConfirmation,
} from '../hooks';

/**
 * Settings > Delete account (Google Play and App Store require it in-app). Says what is deleted first;
 * the only owner of a business must also type its name, because the business goes too.
 */
export function DeleteAccountScreen() {
  const { t } = useTranslation();
  const preview = useAccountDeletionPreview();
  const name = preview.data?.business_name ?? '';
  const { typed, setTyped, isMatch } = useTypedConfirmation(name);
  const [confirming, setConfirming] = React.useState(false);
  const del = useDeleteAccount(() => router.replace('/'));

  const data = preview.data;
  const businessGoes = data?.business_deleted === true;
  const canDelete =
    Boolean(data) && (!businessGoes || isMatch) && !del.isPending;

  return (
    <Page
      title={t('account.delete.title')}
      backLabel={t('tabs.settings')}
      backFallback="/settings"
    >
      {preview.isPending ? <ListSkeleton /> : null}

      {preview.isError ? (
        <View accessibilityRole="alert" className="mx-5 mt-4 gap-3">
          <Text className="text-muted-foreground">
            {t('account.delete.loadFailed')}
          </Text>
          <Button variant="secondary" onPress={() => void preview.refetch()}>
            <Text>{t('common.retry')}</Text>
          </Button>
        </View>
      ) : null}

      {data ? (
        <>
          <SectionTitle>{t('account.delete.whatHappens')}</SectionTitle>
          <Text className="mx-5 text-body">
            {businessGoes
              ? t('account.delete.soleOwner', {
                  name: data.business_name,
                  count: data.other_member_count,
                })
              : t('account.delete.member')}
          </Text>
          <Text className="mx-5 mt-3 text-subtitle text-muted-foreground">
            {t('account.delete.always')}
          </Text>

          {businessGoes ? (
            <>
              <SectionTitle>
                {t('account.delete.typeName', { name: data.business_name })}
              </SectionTitle>
              <Group>
                <InsetInput
                  label={t('account.delete.nameField')}
                  placeholder={data.business_name}
                  value={typed}
                  onChangeText={setTyped}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </Group>
            </>
          ) : null}

          <View className="mx-5 mt-6">
            <Button
              variant="destructive"
              disabled={!canDelete}
              onPress={() => setConfirming(true)}
              accessibilityLabel={t('account.delete.action')}
            >
              <Text>{t('account.delete.action')}</Text>
            </Button>
          </View>
        </>
      ) : null}

      <Text className="mx-5 mb-6 mt-4 text-meta text-muted-foreground">
        {t('account.delete.support')}
      </Text>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('account.delete.confirmTitle')}
        description={t('account.delete.confirmBody')}
        confirmLabel={t('account.delete.action')}
        cancelLabel={t('account.delete.keep')}
        destructive
        onConfirm={() => {
          setConfirming(false);
          del.mutate(businessGoes ? { confirmBusinessName: typed } : {});
        }}
      />
    </Page>
  );
}
