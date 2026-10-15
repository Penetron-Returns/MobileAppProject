/** Result unwrapping shared by the Supabase repositories: PostgREST errors become AppErrors. */
import { AppError, mapDbError, type PostgrestLikeError } from '../lib/errors.ts';

export interface Result<T> {
  data: T | null;
  error: PostgrestLikeError | null;
  count?: number | null;
}

export function rows<T>(result: Result<unknown>): T[] {
  if (result.error) throw mapDbError(result.error);
  return (result.data ?? []) as T[];
}

export function maybe<T>(result: Result<unknown>): T | null {
  if (result.error) throw mapDbError(result.error);
  return (result.data ?? null) as T | null;
}

export function one<T>(result: Result<unknown>, entity: string): T {
  const row = maybe<T>(result);
  if (!row) throw new AppError('NOT_FOUND', `${entity} not found`);
  return row;
}

export function count(result: Result<unknown>): number {
  if (result.error) throw mapDbError(result.error);
  return result.count ?? 0;
}

export function check(result: Result<unknown>): void {
  if (result.error) throw mapDbError(result.error);
}
