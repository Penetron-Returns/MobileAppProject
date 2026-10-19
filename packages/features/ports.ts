/**
 * Contracts between modules, one file per feature, re-exported here so
 * consumers have a single place to import from. Changing a signature means
 * updating every implementation and fake in the same PR.
 */
export * from './attendance/ports.ts';
export * from './bookings/ports.ts';
export * from './reports/ports.ts';
export * from './team/ports.ts';
