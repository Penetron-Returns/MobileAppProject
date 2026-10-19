/** What kind of capability an app adds. Each kind maps to a small port in @booking/features (never one big interface). */
export type AppKind = 'messaging' | 'calendar' | 'payments';

/** The facts the platform needs to list and mount an app. One per app, in the app's `_metadata.ts`. */
export interface AppManifest {
  /** Stable id, also the folder name under packages/app-store */
  readonly id: string;
  readonly name: string;
  readonly kind: AppKind;
  /** One sentence for Settings, Connected apps */
  readonly description: string;
}
