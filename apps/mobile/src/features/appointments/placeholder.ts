import type { AppointmentDetail, AppointmentListItem } from './hooks';

/**
 * A booking detail built from a calendar row, shown while the real detail
 * loads. Fields the list does not carry (client tags, service category, staff
 * photo, creation time) are neutral; no screen renders them from a placeholder.
 */
export function detailFromListItem(
  row: AppointmentListItem,
): AppointmentDetail {
  return {
    ...row,
    created_at: row.starts_at,
    client: { ...row.client, tags: [] },
    service: { ...row.service, category: null },
    staff: { name: row.staff.name, photo_url: null },
  } as unknown as AppointmentDetail;
}
