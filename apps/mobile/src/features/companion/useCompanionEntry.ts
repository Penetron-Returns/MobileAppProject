import { useEntitlements } from '@/features/plans/hooks';

export interface CompanionEntry {
  /** Whether the companion dome shows above the tab bar. */
  isVisible: boolean;
  /** Things waiting on the owner; the badge is hidden at 0. */
  attentionCount: number;
}

/**
 * The only place the companion dome's visibility and badge are decided.
 * Visible only when the plan includes `companion` (fails closed while
 * loading). The attention count is a placeholder until the companion has
 * something to ask for: it is always 0, so the badge stays hidden.
 */
export function useCompanionEntry(): CompanionEntry {
  const isVisible = useEntitlements().has('companion');
  return { isVisible, attentionCount: 0 };
}
