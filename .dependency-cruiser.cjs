/**
 * Boundary rules. They encode the "Dependency rules" section of docs/architecture.md exactly;
 * change both in the same PR. Run with `npm run check:boundaries`.
 *
 *   apps/*        -> packages/*                 (apps never import other apps)
 *   companion     -> features (ports), types, database
 *   app-store     -> features (ports), types, database
 *   extensions    -> features (ports), types, database
 *   features      -> types, database            (never companion, extensions, app-store or apps)
 *   ui            -> types                      (never features)
 *   types         -> nothing
 *
 * Plus the runtime boundaries behind them: the mobile app bundles with Metro, so it never imports
 * server code, and packages/features stays free of Hono.
 */
const DOMAIN = 'packages/(features|companion|app-store|extensions|testing)/';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'apps-never-import-other-apps',
      comment: 'Apps are thin deployables. Shared code belongs in a package.',
      severity: 'error',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/', pathNot: '^apps/$1/' },
    },
    {
      name: 'features-never-import-add-ons-or-apps',
      comment: 'features is the lowest domain layer. It depends only on types and database types.',
      severity: 'error',
      from: { path: '^packages/features/' },
      to: { path: '^(apps/|packages/(companion|app-store|extensions|testing|ui)/)' },
    },
    {
      name: 'features-never-import-hono',
      comment: 'features stays runtime-neutral: no HTTP framework.',
      severity: 'error',
      from: { path: '^packages/features/' },
      to: { path: '(^|node_modules/)hono(/|$)' },
    },
    {
      name: 'companion-only-features-and-types',
      comment: 'The companion depends on features ports, types and database types only, so it reads on its own.',
      severity: 'error',
      from: { path: '^packages/companion/' },
      to: { path: '^(apps/|packages/(app-store|extensions|testing|ui)/)' },
    },
    {
      name: 'app-store-only-features-and-types',
      comment: 'App-store apps depend on features ports, types and database types only.',
      severity: 'error',
      from: { path: '^packages/app-store/' },
      to: { path: '^(apps/|packages/(companion|extensions|testing|ui)/)' },
    },
    {
      name: 'extensions-only-features-and-types',
      comment: 'Extensions use feature services through ports, never the companion, app-store or apps.',
      severity: 'error',
      from: { path: '^packages/extensions/' },
      to: { path: '^(apps/|packages/(companion|app-store|testing|ui)/)' },
    },
    {
      name: 'types-import-nothing',
      comment: 'packages/types is types only: no runtime code, no dependencies.',
      severity: 'error',
      from: { path: '^packages/types/' },
      to: { pathNot: '^packages/types/' },
    },
    {
      name: 'ui-never-imports-domain',
      comment: 'The design system knows nothing about the domain.',
      severity: 'error',
      from: { path: '^packages/ui/' },
      to: { path: `^${DOMAIN}` },
    },
    {
      name: 'mobile-never-imports-server-code',
      comment: 'Metro bundles the mobile app. Server packages and apps/api stay out of it.',
      severity: 'error',
      from: { path: '^apps/mobile/' },
      to: { path: `^(apps/api/|${DOMAIN}|packages/database/supabase/)` },
    },
    {
      name: 'production-code-never-imports-testing',
      comment: 'Fakes in packages/testing are for tests only.',
      severity: 'error',
      from: { path: '^(apps/[^/]+/src/|packages/(features|companion|app-store|extensions|types|ui)/)' },
      to: { path: '^packages/testing/' },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.depcruise.json' },
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(node_modules|\.expo|coverage|dist)/' },
    moduleSystems: ['es6', 'cjs'],
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
