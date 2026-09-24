/**
 * Pure message renderers used by the transition. They only read data that
 * the transition already obtained through `need()`.
 */
import type { AppointmentDTO, ServiceDTO, StaffDTO } from '../../../../shared/api.ts';
import { rid, type MoreList } from '../ids.ts';
import { buttons, list, type ListRow, type OutMessage } from '../messages.ts';
import { money, summaryLines } from '../format.ts';
import { COPY } from './copy.ts';
import type { EngineCtx } from './types.ts';

export const PAGE_SIZE = 9;
const MAX_ROWS = 10;

export function withLead(lead: string | undefined, body: string): string {
  return lead ? `${lead}\n\n${body}` : body;
}

export function menuMessage(businessName: string, lead?: string): OutMessage {
  const body = lead ? `${lead}\n\nWhat would you like to do?` : COPY.menuBody(businessName);
  return buttons(body, [
    { id: rid.menu('book'), title: COPY.menuButtons.book },
    { id: rid.menu('bookings'), title: COPY.menuButtons.bookings },
    { id: rid.menu('help'), title: COPY.menuButtons.help },
  ]);
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

/** True when `page` exists for a list of `total` items. */
export function validPage(total: number, page: number): boolean {
  return Number.isInteger(page) && page >= 0 && page * PAGE_SIZE < Math.max(total, 1);
}

/**
 * A paged list: up to 9 data rows, then "More" if more remain, then
 * navigation rows while there is room (10 rows max in total).
 */
export function pagedList(opts: {
  body: string;
  button: string;
  rows: ListRow[];
  page: number;
  more: { list: MoreList; title: string };
  nav: ('back' | 'menu')[];
}): OutMessage {
  const start = opts.page * PAGE_SIZE;
  const pageRows = opts.rows.slice(start, start + PAGE_SIZE);
  const options: ListRow[] = [];
  if (opts.rows.length > start + PAGE_SIZE) options.push({ id: rid.more(opts.more.list, opts.page + 1), title: opts.more.title });
  for (const n of opts.nav) {
    if (pageRows.length + options.length >= MAX_ROWS) break;
    options.push({ id: rid.nav(n), title: n === 'back' ? COPY.back : COPY.mainMenu });
  }
  return list(opts.body, opts.button, [
    { title: opts.button, rows: pageRows },
    { title: COPY.sectionOptions, rows: options },
  ]);
}

export function serviceName(services: ServiceDTO[], id: string): string {
  return services.find((s) => s.id === id)?.name ?? 'Appointment';
}

export function staffName(staff: StaffDTO[], id: string | null | undefined): string | null {
  if (!id) return null;
  return staff.find((s) => s.id === id)?.name ?? null;
}

export function serviceRow(s: ServiceDTO, currency: string): ListRow {
  const parts = [`${s.duration_minutes} min`];
  if (s.price_cents > 0) parts.push(money(s.price_cents, currency));
  return { id: rid.svc(s.id), title: s.name, description: parts.join(' · ') };
}

export function appointmentSummary(
  appt: Pick<AppointmentDTO, 'service_id' | 'staff_id' | 'starts_at'>,
  services: ServiceDTO[],
  staff: StaffDTO[],
  ctx: EngineCtx,
): string {
  return summaryLines(
    { service: serviceName(services, appt.service_id), startsAt: appt.starts_at, staff: staffName(staff, appt.staff_id) },
    ctx.business.timezone,
  );
}
