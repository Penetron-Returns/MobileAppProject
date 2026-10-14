import type { MiddlewareHandler } from 'hono';

import type { FeatureKey } from '../../../../packages/shared/api.ts';
import { AppError } from '../lib/errors.ts';
import type { AppEnv } from '../types.ts';

/**
 * Gates a route on a plan feature (not a plan name). Runs after requireAuth().
 * Live lookup on every call so a plan change applies immediately.
 */
export function requireFeature(feature: FeatureKey): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const { businessId } = c.get('auth');
    if (!(await c.get('container').entitlements.hasFeature(businessId, feature))) {
      throw new AppError('FEATURE_NOT_IN_PLAN', 'This feature is not included in your plan', { feature });
    }
    await next();
  };
}
