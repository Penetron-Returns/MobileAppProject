/**
 * Hand-written list of app-store apps. Adding an app is a new folder plus one line here; removing
 * one is deleting the folder and its line. There is no generator until there are enough apps to need one.
 */
import { whatsappApp } from './whatsapp/_metadata.ts';
import type { AppManifest } from './types.ts';

export const APPS = {
  whatsapp: whatsappApp,
} as const satisfies Record<string, AppManifest>;

export type AppId = keyof typeof APPS;

export function listApps(): AppManifest[] {
  return Object.values(APPS);
}
