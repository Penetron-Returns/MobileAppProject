# repositories

Persistence for the booking schema behind small interfaces (catalogue, appointments, clients, members, attempts, identity, maintenance) in `types.ts`, implemented once over Supabase in `supabase.ts`. The in-memory fake is in `@booking/testing`.

It is one shared adapter rather than one per feature because the schema is one cohesive model and most services touch several areas. A service depends on the narrowest interface it needs.
