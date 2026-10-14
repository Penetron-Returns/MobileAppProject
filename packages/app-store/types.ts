import type { FeatureKey } from '@booking/types';

/** What kind of capability an app adds. Each kind maps to a small port in @booking/features (never one big interface). */
export type AppKind = 'messaging' | 'calendar' | 'payments';

/** The facts the platform needs to list, gate and mount an app. One per app, in the app's `_metadata.ts`. */
export interface AppManifest {
  /** Stable id, also the folder name under packages/app-store */
  readonly id: string;
  readonly name: string;
  readonly kind: AppKind;
  /** Plan feature that must be on for a business to use the app. Gating is on the plan, never on "installed". */
  readonly requiredFeature: FeatureKey;
  /** One sentence for Settings, Connected apps */
  readonly description: string;
}
