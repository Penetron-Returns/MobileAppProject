import { useLocalSearchParams } from 'expo-router';
import * as React from 'react';

import { ClovieLoading } from '@/features/brand/ClovieLoading';
import { useBusiness } from '@/features/business/hooks';

import { parseVoiceCommand } from '../logic';
import { useCheckInByVoice, useRequestByVoice } from '../useVoiceCommand';

function ArrivalRunner({
  timezone,
  name,
}: {
  timezone: string;
  name?: string;
}) {
  useCheckInByVoice(timezone, name);
  return <ClovieLoading />;
}

function RequestRunner({ text }: { text: string }) {
  useRequestByVoice(text);
  return <ClovieLoading />;
}

/**
 * Landing page of `bookingadmin://voice?text=...`, opened by the Hey Clovie
 * service. It runs the command and leaves: "client has arrived" checks someone
 * in, anything else opens the companion with what was said.
 */
export function VoiceCommandScreen() {
  const params = useLocalSearchParams<{ text?: string | string[] }>();
  const raw = Array.isArray(params.text) ? params.text[0] : params.text;
  const command = React.useMemo(() => parseVoiceCommand(raw ?? ''), [raw]);
  const business = useBusiness();

  if (command.kind === 'request') return <RequestRunner text={command.text} />;
  if (!business.data) return <ClovieLoading />;
  return (
    <ArrivalRunner timezone={business.data.timezone} name={command.name} />
  );
}
