# plans

Entitlements. The database (`plan_features` through `business_features()`) is the single source of truth; this feature only reads it. Callers ask whether a business has feature X, never which plan it is on. `hasFeatureOrNone` is for gates that treat an unknown business as not entitled.
