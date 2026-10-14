/**
 * The API client. `client` holds the request core and `ApiError`;
 * `endpoints` is the typed map of owner/staff routes and `public` the
 * unauthenticated web-booking routes. Import from '@/lib/api' only.
 */
export {
  ApiError,
  apiRequest,
  buildUrl,
  isApiError,
  newIdempotencyKey,
  parseEnvelope,
} from './client';
export type { ClientErrorCode, RequestOptions } from './client';
export { api } from './endpoints';
export { publicApi } from './public';
