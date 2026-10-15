/** Supabase implementation of ScheduleRepository: special days, staff breaks and staff time off. */
import type { Database, Json } from '@booking/database';
import type { Db } from '../lib/db.ts';
import { check, count, maybe, one, rows } from './dbResult.ts';
import type { SpecialDayRow, StaffBreakRow, TimeOffRow } from './rows.ts';
import type { ScheduleRepository } from './types.ts';

type TableName = keyof Database['public']['Tables'];

const SPECIAL_DAY_COLS = 'id, business_id, date, name, kind, is_closed, start_time, end_time';
const BREAK_COLS = 'id, business_id, staff_id, label, start_time, end_time, weekdays';
const TIME_OFF_COLS = 'id, business_id, staff_id, starts_on, ends_on, start_time, end_time, reason, note';

export function createSupabaseScheduleRepository(db: Db): ScheduleRepository {
  const t = <T extends TableName>(table: T) => db.from(table);

  return {
    async listSpecialDays(businessId, from, to) {
      return rows<SpecialDayRow>(
        await t('business_special_days')
          .select(SPECIAL_DAY_COLS)
          .eq('business_id', businessId)
          .gte('date', from)
          .lte('date', to)
          .order('date'),
      );
    },
    async getSpecialDay(businessId, id) {
      return maybe<SpecialDayRow>(
        await t('business_special_days').select(SPECIAL_DAY_COLS).eq('business_id', businessId).eq('id', id).maybeSingle(),
      );
    },
    async insertSpecialDay(businessId, values) {
      return one<SpecialDayRow>(
        await t('business_special_days').insert({ ...values, business_id: businessId }).select(SPECIAL_DAY_COLS).single(),
        'Special day',
      );
    },
    async updateSpecialDay(businessId, id, patch) {
      return maybe<SpecialDayRow>(
        await t('business_special_days')
          .update(patch)
          .eq('business_id', businessId)
          .eq('id', id)
          .select(SPECIAL_DAY_COLS)
          .maybeSingle(),
      );
    },
    async deleteSpecialDay(businessId, id) {
      return count(await t('business_special_days').delete({ count: 'exact' }).eq('business_id', businessId).eq('id', id)) > 0;
    },

    async listStaffBreaks(businessId, staffIds) {
      if (staffIds.length === 0) return [];
      return rows<StaffBreakRow>(
        await t('staff_breaks')
          .select(BREAK_COLS)
          .eq('business_id', businessId)
          .in('staff_id', staffIds)
          .order('start_time')
          .order('label')
          .order('id'),
      );
    },
    async replaceStaffBreaks(_businessId, staffId, breaks) {
      const result = await db.rpc('replace_staff_breaks', { p_staff_id: staffId, p_rows: breaks as unknown as Json });
      return rows<StaffBreakRow>(result);
    },

    async listTimeOff(businessId, from, to, staffIds) {
      if (staffIds && staffIds.length === 0) return [];
      let q = t('staff_time_off').select(TIME_OFF_COLS).eq('business_id', businessId).lte('starts_on', to).gte('ends_on', from);
      if (staffIds) q = q.in('staff_id', staffIds);
      return rows<TimeOffRow>(await q.order('starts_on').order('id'));
    },
    async getTimeOff(businessId, id) {
      return maybe<TimeOffRow>(
        await t('staff_time_off').select(TIME_OFF_COLS).eq('business_id', businessId).eq('id', id).maybeSingle(),
      );
    },
    async insertTimeOff(businessId, staffId, values) {
      return one<TimeOffRow>(
        await t('staff_time_off')
          .insert({ ...values, business_id: businessId, staff_id: staffId })
          .select(TIME_OFF_COLS)
          .single(),
        'Time off',
      );
    },
    async updateTimeOff(businessId, id, patch) {
      return maybe<TimeOffRow>(
        await t('staff_time_off').update(patch).eq('business_id', businessId).eq('id', id).select(TIME_OFF_COLS).maybeSingle(),
      );
    },
    async deleteTimeOff(businessId, id) {
      return count(await t('staff_time_off').delete({ count: 'exact' }).eq('business_id', businessId).eq('id', id)) > 0;
    },
  };
}
