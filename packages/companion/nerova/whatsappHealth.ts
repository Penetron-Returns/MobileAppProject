/**
 * Maps Nerova's WhatsApp health object (camelCase, lowercase snake enums) to our snake_case DTO fields.
 * Tolerant by design: a missing field is omitted, an unknown enum value becomes 'unknown' (template category is
 * passed through as a string). Used by the setup read and the `channel.health_changed` webhook.
 */
import type {
  WhatsAppHealthDTO,
  WhatsAppHealthTemplateDTO,
  WhatsAppHealthTemplateStatus,
  WhatsAppLastErrorDTO,
  WhatsAppMessagingLimitTier,
  WhatsAppNameStatus,
  WhatsAppPhoneNumberStatus,
  WhatsAppQualityRating,
} from '@booking/types';

type Json = Record<string, unknown>;

const PHONE_STATUSES: readonly WhatsAppPhoneNumberStatus[] = ['connected', 'pending', 'flagged', 'restricted', 'disconnected'];
const QUALITY: readonly WhatsAppQualityRating[] = ['green', 'yellow', 'red'];
const TIERS: readonly WhatsAppMessagingLimitTier[] = ['tier_250', 'tier_1k', 'tier_10k', 'tier_100k', 'unlimited'];
const NAME_STATUSES: readonly WhatsAppNameStatus[] = ['approved', 'pending_review', 'declined', 'expired', 'available_without_review', 'none'];
const TEMPLATE_STATUSES: readonly WhatsAppHealthTemplateStatus[] = ['approved', 'pending', 'rejected', 'paused', 'disabled'];

const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);
const record = (value: unknown): Json | null => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : null);

/** The enum member equal to `value`, else 'unknown'. */
function pick<T extends string>(allowed: readonly T[], value: unknown): T | 'unknown' {
  return allowed.find((a) => a === value) ?? 'unknown';
}

function mapTemplate(value: unknown): WhatsAppHealthTemplateDTO | null {
  const t = record(value);
  const name = t ? text(t.name) : null;
  if (!t || !name) return null;
  return { name, category: text(t.category), status: pick(TEMPLATE_STATUSES, t.status), rejected_reason: text(t.rejectedReason) };
}

function mapLastError(value: unknown): WhatsAppLastErrorDTO | null {
  const e = record(value);
  const message = e ? text(e.message) : null;
  if (!e || !message) return null;
  const code = e.code;
  return { code: typeof code === 'number' ? String(code) : text(code), message, at: text(e.at) };
}

/** Only the fields Nerova actually sent are set; `{}` means no health reported. */
export function parseWhatsAppHealth(source: unknown): WhatsAppHealthDTO {
  const body = record(source) ?? {};
  const out: WhatsAppHealthDTO = {};
  if (text(body.phoneNumberStatus)) out.phone_number_status = pick(PHONE_STATUSES, body.phoneNumberStatus);
  if (text(body.qualityRating)) out.quality_rating = pick(QUALITY, body.qualityRating);
  if (text(body.messagingLimitTier)) out.messaging_limit_tier = pick(TIERS, body.messagingLimitTier);
  if ('verifiedName' in body) out.verified_name = text(body.verifiedName);
  if (text(body.nameStatus)) out.name_status = pick(NAME_STATUSES, body.nameStatus);
  if (Array.isArray(body.templates)) out.templates = body.templates.map(mapTemplate).filter((t): t is WhatsAppHealthTemplateDTO => t !== null);
  if ('lastError' in body) out.last_error = mapLastError(body.lastError);
  if ('lastHealthCheckAt' in body) out.last_health_check_at = text(body.lastHealthCheckAt);
  return out;
}
