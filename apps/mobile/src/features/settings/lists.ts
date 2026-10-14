/** Pure helpers behind the Services and Staff list screens. */

/** Groups by trimmed category, keeping first-seen order; blank ones go under `other`. */
export function groupByCategory<T extends { category: string | null }>(
  items: T[],
  other: string,
): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.category?.trim() || other;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()];
}

/** Distinct non-blank categories, for the "existing categories" hint. */
export function existingCategories(items: { category: string | null }[]) {
  return [
    ...new Set(
      items.map((i) => i.category?.trim()).filter((c): c is string => !!c),
    ),
  ];
}

/** Joins the parts that exist with a middle dot ("45 min · R350"). */
export function joinMeta(...parts: (string | null | false | undefined)[]) {
  return parts.filter((p): p is string => !!p).join(' · ');
}

export type StaffStatus = 'active' | 'paused' | 'inactive';

/** Inactive wins over "not taking bookings"; both are exceptions worth showing. */
export function staffStatus(member: {
  is_active: boolean;
  accepts_bookings: boolean;
}): StaffStatus {
  if (!member.is_active) return 'inactive';
  return member.accepts_bookings ? 'active' : 'paused';
}
