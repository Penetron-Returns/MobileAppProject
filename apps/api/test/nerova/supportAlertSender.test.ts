import { describe, expect, it, vi } from 'vitest';

import { createSupportAlertSender } from '@booking/companion/support/alertSender.ts';
import type { Logger } from '@booking/features/lib/logger.ts';
import type { SupportAlert } from '@booking/features/support/ports.ts';

const alert: SupportAlert = {
  businessId: 'b1',
  businessName: 'Harbour Salon',
  supportRequestId: 'r1',
  category: 'billing',
  reason: 'card declined',
  summary: 'Help',
  healthSummary: 'status connected, quality green, verification approved, billing payment method attached',
  raisedAt: '2026-10-19T10:00:00.000Z',
  escalationId: 'esc_1',
};
const logger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } as unknown as Logger;

describe('createSupportAlertSender', () => {
  it('is a no-op (no fetch) when any of the three variables is missing', async () => {
    const fetchImpl = vi.fn();
    for (const env of [{}, { RESEND_API_KEY: 'k', SUPPORT_ALERT_EMAIL: 'a@b.c' }, { SUPPORT_ALERT_EMAIL: 'a@b.c', SUPPORT_ALERT_FROM: 'x@y.z' }]) {
      await createSupportAlertSender(env, logger, fetchImpl as unknown as typeof fetch).send(alert);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts to Resend with the bearer key and the alert content', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const env = { RESEND_API_KEY: 'key_1', SUPPORT_ALERT_EMAIL: 'support@getclovie.app', SUPPORT_ALERT_FROM: 'Clovie <alerts@getclovie.app>' };
    await createSupportAlertSender(env, logger, fetchImpl as unknown as typeof fetch).send(alert);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer key_1');
    const body = JSON.parse(init.body as string) as { from: string; to: string[]; subject: string; text: string };
    expect(body).toMatchObject({ from: 'Clovie <alerts@getclovie.app>', to: ['support@getclovie.app'] });
    expect(body.subject).toContain('Harbour Salon');
    expect(body.text).toContain('b1');
    expect(body.text).toContain('esc_1');
    expect(body.text).toContain('card declined');
  });

  it('throws when Resend answers an error so the caller can log it', async () => {
    const fetchImpl = vi.fn(async () => new Response('no', { status: 422 }));
    const env = { RESEND_API_KEY: 'k', SUPPORT_ALERT_EMAIL: 'a@b.c', SUPPORT_ALERT_FROM: 'x@y.z' };
    await expect(createSupportAlertSender(env, logger, fetchImpl as unknown as typeof fetch).send(alert)).rejects.toThrow('422');
  });
});
