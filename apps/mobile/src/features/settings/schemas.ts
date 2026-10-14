import type {
  CreateServiceRequest,
  CreateStaffRequest,
  UpdateBusinessRequest,
} from '@shared/api';
import { z } from 'zod';

import { parseMoneyToCents } from '@/lib/format';

type T = (key: string) => string;

const optionalText = (max: number) => z.string().trim().max(max);

export function businessDetailsSchema(t: T) {
  return z.object({
    name: z.string().trim().min(1, t('forms.required')).max(120),
    email: z.union([z.literal(''), z.email(t('forms.invalidEmail'))]),
    phone: optionalText(32),
    address: optionalText(300),
    currency: z.string().regex(/^[A-Z]{3}$/),
  });
}

export type BusinessDetailsValues = z.infer<
  ReturnType<typeof businessDetailsSchema>
>;

export function toUpdateBusinessRequest(
  v: BusinessDetailsValues,
): UpdateBusinessRequest {
  return {
    name: v.name,
    email: v.email || null,
    phone: v.phone || null,
    address: v.address || null,
    currency: v.currency,
  };
}

export const DURATION_PRESETS = [15, 30, 45, 60, 90, 120, 180, 240] as const;

export function serviceSchema(t: T) {
  return z.object({
    name: z.string().trim().min(1, t('forms.required')).max(120),
    category: optionalText(80),
    duration_minutes: z.number().int().min(1).max(720),
    price: z
      .string()
      .refine((p) => parseMoneyToCents(p) !== null, t('forms.invalidPrice')),
    is_active: z.boolean(),
    /** Who does it. Absent when the team has not loaded: links stay as they are. */
    staff_ids: z.array(z.string()).optional(),
  });
}

export type ServiceValues = z.infer<ReturnType<typeof serviceSchema>>;

/** Only the fields this form edits, so an update never overwrites the rest. */
export function toServiceFields(
  v: ServiceValues,
): Pick<
  CreateServiceRequest,
  'name' | 'category' | 'duration_minutes' | 'price_cents'
> & { is_active: boolean; staff_ids?: string[] } {
  return {
    name: v.name,
    category: v.category || null,
    duration_minutes: v.duration_minutes,
    price_cents: parseMoneyToCents(v.price) ?? 0,
    is_active: v.is_active,
    ...(v.staff_ids ? { staff_ids: v.staff_ids } : {}),
  };
}

export function toCreateServiceRequest(v: ServiceValues): CreateServiceRequest {
  return {
    description: null,
    deposit_cents: 0,
    sort_order: 0,
    ...toServiceFields(v),
  };
}

export function staffSchema(t: T) {
  return z.object({
    name: z.string().trim().min(1, t('forms.required')).max(120),
    title: optionalText(80),
    is_active: z.boolean(),
    accepts_bookings: z.boolean(),
    service_ids: z.array(z.string()),
  });
}

export type StaffValues = z.infer<ReturnType<typeof staffSchema>>;

/** Only the fields this form edits, so an update keeps the login link, photo and contact details. */
export function toStaffFields(
  v: StaffValues,
): Pick<CreateStaffRequest, 'name' | 'title'> &
  Required<
    Pick<CreateStaffRequest, 'is_active' | 'accepts_bookings' | 'service_ids'>
  > {
  return {
    name: v.name,
    title: v.title || null,
    is_active: v.is_active,
    accepts_bookings: v.accepts_bookings,
    service_ids: v.service_ids,
  };
}

export function toCreateStaffRequest(v: StaffValues): CreateStaffRequest {
  return {
    user_id: null,
    photo_url: null,
    phone: null,
    email: null,
    color: null,
    ...toStaffFields(v),
  };
}
