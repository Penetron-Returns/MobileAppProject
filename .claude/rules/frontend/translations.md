---
paths: src/**/*.tsx,src/lib/i18n/**
description: Rules for user-facing strings and i18n
---

# Translations

All user-facing text goes through i18n so wording stays consistent and the app can be localised later.

## Implementation

1. Put every user-facing string in `src/lib/i18n/locales/en-US.json` and render it with `t('<feature>.<key>')`.
2. Namespace keys by feature (`calendar.today`, `clients.empty.title`) and keep them stable. Change the copy, not the key.
3. Use interpolation for dynamic values (`t('booking.with', { name })`). Never concatenate translated fragments.
4. Format dates, times and money with the shared formatters, not in translation strings.

## Examples

```tsx
// ✅ DO
<Text>{t('dashboard.nextAppointment')}</Text>

// ❌ DON'T
<Text>Next appointment</Text>
<Text>{t('with') + ' ' + name}</Text>
```
