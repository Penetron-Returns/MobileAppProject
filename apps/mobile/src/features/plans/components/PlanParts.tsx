import type { PlanDTO } from '@booking/types';
import {
  Button,
  Disclosure,
  Divider,
  Group,
  GroupRow,
  Surface,
  Text,
  useDepth,
} from '@booking/ui';
import {
  Bell,
  ChartNoAxesColumn,
  Lock,
  MessageCircle,
  Sparkles,
  type LucideIcon,
} from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { comparisonRows, type CellTone } from '../compare';
import { formatRand } from '../logic';

/** One equal tier card: name, price, allowance and one choose button. */
export function TierCard({
  plan,
  onChoose,
}: {
  plan: PlanDTO;
  onChoose: (plan: PlanDTO) => void;
}) {
  const { t } = useTranslation();
  const price = formatRand(plan.price_cents);
  return (
    <Surface variant="raised" radius={26} className="mx-5 mt-3 p-4">
      <Text className="text-title font-semibold">{plan.name}</Text>
      <View
        style={{ gap: 6 }}
        className="mt-1 flex-row items-baseline"
        accessible
        accessibilityLabel={t('plans.tier.priceLabel', { price })}
      >
        <Text
          style={{ fontVariant: ['tabular-nums'] }}
          className="text-large-title font-bold"
        >
          {price}
        </Text>
        <Text className="text-title text-muted-foreground">
          {t('plans.tier.perMonth')}
        </Text>
      </View>
      <Text
        style={{ fontVariant: ['tabular-nums'] }}
        className="mt-0.5 text-title"
      >
        {t('plans.tier.jobs', { count: plan.included_jobs ?? 0 })}
      </Text>
      <Text className="mt-0.5 text-meta text-muted-foreground">
        {t('plans.tier.perJob', {
          price: formatRand(plan.extra_job_cents ?? 0),
        })}
      </Text>
      {plan.is_current ? (
        <Surface
          variant="inset"
          radius={24}
          accessible
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          accessibilityLabel={t('plans.tier.currentLabel', { name: plan.name })}
          className="mt-3.5 h-12 items-center justify-center"
        >
          <Text className="text-title text-muted-foreground">
            {t('plans.tier.current')}
          </Text>
        </Surface>
      ) : (
        <Button
          variant="secondary"
          size="lg"
          className="mt-3.5"
          accessibilityLabel={t('plans.tier.chooseLabel', {
            name: plan.name,
            price,
          })}
          onPress={() => onChoose(plan)}
        >
          <Text className="text-title">
            {t('plans.tier.choose', { name: plan.name })}
          </Text>
        </Button>
      )}
    </Surface>
  );
}

const PERKS: { key: string; icon: LucideIcon }[] = [
  { key: 'whatsapp', icon: MessageCircle },
  { key: 'gaps', icon: Sparkles },
  { key: 'reminders', icon: Bell },
  { key: 'reports', icon: ChartNoAxesColumn },
];

/** What every paid plan includes, shown once. */
export function CompanionPerks() {
  const { t } = useTranslation();
  const depth = useDepth();
  return (
    <Surface variant="raised" radius={26} className="mx-5 mt-3 overflow-hidden">
      {PERKS.map(({ key, icon: Glyph }, i) => (
        <View
          key={key}
          className="relative min-h-14 flex-row items-center gap-3 px-4 py-2"
        >
          {i > 0 ? <Divider /> : null}
          <Glyph size={20} strokeWidth={1.9} color={depth.colors.tint} />
          <Text className="flex-1 text-title">{t(`plans.perks.${key}`)}</Text>
        </View>
      ))}
    </Surface>
  );
}

const TONE_COLOR: Record<CellTone, 'label' | 'green' | 'secondary'> = {
  text: 'label',
  yes: 'green',
  no: 'secondary',
};

/** "Compare plans": a disclosure that opens the table, columns in catalogue order. */
export function ComparePlans({ plans }: { plans: readonly PlanDTO[] }) {
  const { t } = useTranslation();
  const depth = useDepth();
  const [open, setOpen] = React.useState(false);
  const rows = comparisonRows(plans);
  return (
    <Surface variant="raised" radius={26} className="mx-5 mt-4 px-4">
      <Disclosure
        variant="row"
        label={t('plans.compare.title')}
        expanded={open}
        onPress={() => setOpen((v) => !v)}
        className="min-h-14"
      />
      {open ? (
        <View className="pb-2">
          <View className="min-h-8 flex-row items-center">
            <View className="flex-1" />
            {plans.map((p) => (
              <Text
                key={p.id}
                numberOfLines={1}
                className="w-[58px] text-center text-meta font-semibold text-muted-foreground"
              >
                {p.name}
              </Text>
            ))}
          </View>
          {rows.map((row) => (
            <View
              key={row.key}
              accessible
              accessibilityLabel={`${t(`plans.compare.rows.${row.key}`)}: ${row.cells
                .map((c, i) => `${plans[i]?.name} ${cellText(t, c)}`)
                .join(', ')}`}
              className="relative min-h-11 flex-row items-center"
            >
              <Divider />
              <Text className="flex-1 text-subtitle">
                {t(`plans.compare.rows.${row.key}`)}
              </Text>
              {row.cells.map((c, i) => (
                <Text
                  key={plans[i]?.id ?? i}
                  style={{
                    color: depth.colors[TONE_COLOR[c.tone]],
                    fontVariant: ['tabular-nums'],
                  }}
                  className="w-[58px] text-center text-subtitle"
                >
                  {cellText(t, c)}
                </Text>
              ))}
            </View>
          ))}
        </View>
      ) : null}
    </Surface>
  );
}

function cellText(
  t: (key: string) => string,
  cell: { text: string; tone: CellTone },
): string {
  if (cell.tone === 'yes') return t('plans.compare.yes');
  if (cell.tone === 'no') return t('plans.compare.no');
  return cell.text;
}

/** Billing rows: payment and invoices are handled on the web, and there is nothing to manage until a URL exists. */
export function BillingRows({ manageUrl }: { manageUrl: string | null }) {
  const { t } = useTranslation();
  const rows = [
    { key: 'payment', value: t('plans.billing.managedOnWeb') },
    { key: 'invoices', value: t('plans.billing.noInvoices') },
  ];
  return (
    <>
      <Surface
        variant="raised"
        radius={26}
        className="mx-5 mt-3 overflow-hidden"
      >
        {rows.map((row, i) => (
          <View
            key={row.key}
            accessible
            accessibilityLabel={`${t(`plans.billing.${row.key}`)}, ${row.value}`}
            className="relative min-h-14 flex-row items-center gap-2 px-4 py-2"
          >
            {i > 0 ? <Divider /> : null}
            <Text className="flex-1 text-title">
              {t(`plans.billing.${row.key}`)}
            </Text>
            <Text className="text-title text-muted-foreground">
              {row.value}
            </Text>
          </View>
        ))}
      </Surface>
      <ManageRow url={manageUrl} />
      <Text className="mx-5 mt-2.5 text-meta text-muted-foreground">
        {t('plans.billing.footnote')}
      </Text>
    </>
  );
}

/**
 * Always listed. Until the API hands out a subscription-management URL it is
 * dimmed with its reason, never hidden.
 */
function ManageRow({ url }: { url: string | null }) {
  const { t } = useTranslation();
  return (
    <Group className="mt-3" radius={26}>
      <GroupRow
        title={t('plans.billing.manage')}
        disabled={!url}
        reason={t('plans.billing.managedOnWebReason')}
        onPress={() => {
          if (url) {
            void import('expo-web-browser').then((m) =>
              m.openBrowserAsync(url),
            );
          }
        }}
      />
    </Group>
  );
}

/** "Opens secure checkout on the web." with the lock, and what a completed job is. */
export function CheckoutNote() {
  const { t } = useTranslation();
  const depth = useDepth();
  return (
    <>
      <View className="mx-5 mt-3 flex-row items-center gap-1.5">
        <Lock size={14} strokeWidth={2} color={depth.colors.secondary} />
        <Text className="text-meta text-muted-foreground">
          {t('plans.checkoutNote')}
        </Text>
      </View>
      <Text className="mx-5 mt-1.5 text-meta text-muted-foreground">
        {t('plans.completedJobDefinition')}
      </Text>
    </>
  );
}
