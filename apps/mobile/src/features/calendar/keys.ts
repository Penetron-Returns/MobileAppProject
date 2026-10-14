export const calendarKeys = {
  rules: ['calendar', 'availability-rules'] as const,
  overrides: (from: string, to: string) =>
    ['calendar', 'availability-overrides', from, to] as const,
};
