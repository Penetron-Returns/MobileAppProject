import type { PostgrestError } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

import { qk } from '@/lib/query';
import { supabase, unwrap } from '@/lib/supabase';
import { todayISO } from '@/lib/time';

import { buildReport, type ReportRow } from './aggregate';
import {
  periodQueryBounds,
  reportPeriod,
  type ReportPeriod,
  type ReportRange,
} from './period';

const PAGE_SIZE = 1000;
/** A hard ceiling (20,000 rows) so a huge history cannot run away. */
const MAX_PAGES = 20;
/** Reports change slowly, and Realtime invalidates them when a booking changes. */
const REPORT_STALE_MS = 60_000;

const SELECT =
  'starts_at, status, source, price_cents, client_id, staff_id, staff:staff(name, color)';

type Page<T> = PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;

/** PostgREST caps a response at 1000 rows, so read a stable ordering page by page. */
async function fetchPages<T>(
  page: (from: number, to: number) => Page<T>,
): Promise<T[]> {
  const all: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const rows = unwrap(await page(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1));
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}

/** Appointments of the period and the one before it, RLS-scoped to the business. */
async function fetchReportInput(bounds: { from: string; to: string }) {
  const [appointments, clients] = await Promise.all([
    fetchPages((a, b) =>
      supabase
        .from('appointments')
        .select(SELECT)
        .gte('starts_at', bounds.from)
        .lt('starts_at', bounds.to)
        .order('starts_at')
        .order('id')
        .range(a, b),
    ),
    fetchPages((a, b) =>
      supabase
        .from('clients')
        .select('id')
        .gte('created_at', bounds.from)
        .lt('created_at', bounds.to)
        .order('created_at')
        .order('id')
        .range(a, b),
    ),
  ]);
  const rows: ReportRow[] = appointments.map((r) => ({
    starts_at: r.starts_at,
    status: r.status,
    source: r.source,
    price_cents: r.price_cents,
    client_id: r.client_id,
    staff_id: r.staff_id,
    staff_name: r.staff?.name ?? null,
    staff_color: r.staff?.color ?? null,
  }));
  return { rows, clientIds: clients.map((c) => c.id) };
}

/**
 * The Reports screen's numbers for a range: one appointments query (this
 * period and the previous one) and one for clients created in the window,
 * aggregated client-side in the business timezone. No polling: Realtime
 * invalidates `appointments` when a booking changes.
 */
export function useReport(range: ReportRange, timezone: string) {
  const today = todayISO(timezone);
  const period = React.useMemo<ReportPeriod>(
    () => reportPeriod(range, today),
    [range, today],
  );
  const bounds = React.useMemo(
    () => periodQueryBounds(period, timezone),
    [period, timezone],
  );
  const select = React.useCallback(
    (input: Awaited<ReturnType<typeof fetchReportInput>>) =>
      buildReport({
        rows: input.rows,
        newClientIds: new Set(input.clientIds),
        period,
        timezone,
      }),
    [period, timezone],
  );
  const query = useQuery({
    queryKey: qk.reportRows(bounds.from, bounds.to),
    queryFn: () => fetchReportInput(bounds),
    staleTime: REPORT_STALE_MS,
    select,
  });
  return { query, period, today };
}
