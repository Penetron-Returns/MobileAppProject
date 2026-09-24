// STUB — WS-C implements the WhatsApp/notification cron jobs.
import type { Container } from '../container';

type Job = (container: Container, now?: Date) => Promise<Record<string, number>>;

export const runRemindersJob: Job = async () => ({});
export const runConversationExpiryJob: Job = async () => ({});
export const runWabaHealthJob: Job = async () => ({});
export const runTokenRefreshJob: Job = async () => ({});
