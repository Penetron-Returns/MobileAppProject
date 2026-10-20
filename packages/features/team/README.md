# team

Organisation members and invitations (Clerk is the source of truth), the mirror of Clerk users and organisations into our tables, and push device registration.

- `ports.ts`: `ClerkAdmin`
- `lib/clerkAdmin.ts`: the Clerk Backend API client (fetch based)
- `services/`: team operations, session member sync, Clerk webhook handling (`clerkSync.ts`), devices
