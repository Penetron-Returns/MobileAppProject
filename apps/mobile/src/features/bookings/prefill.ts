import type { WhenState } from './components/WhenStep';

/** Route params of New booking when opened from a calendar long-press. */
export interface BookingPrefill {
  staffId?: string;
  /** `YYYY-MM-DD` in the business timezone. */
  date?: string;
  /** `HH:mm` in the business timezone. */
  time?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The "when" the form starts with: params are untrusted text, so bad values are ignored. */
export function whenFromPrefill(prefill?: BookingPrefill): WhenState {
  return {
    staffId: prefill?.staffId || null,
    date: prefill?.date && DATE.test(prefill.date) ? prefill.date : null,
    picked: null,
    notes: '',
    sendWhatsApp: true,
  };
}
