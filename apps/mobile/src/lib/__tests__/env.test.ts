const REQUIRED = [
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY',
] as const;

const ORIGINAL = { ...process.env };

function setEnv(vars: Partial<Record<(typeof REQUIRED)[number], string>>) {
  for (const key of REQUIRED) delete process.env[key];
  Object.assign(process.env, vars);
}

function loadEnvModule(): typeof import('@/lib/env') {
  let mod!: typeof import('@/lib/env');
  jest.isolateModules(() => {
    mod = require('@/lib/env');
  });
  return mod;
}

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('env', () => {
  it('reports every EXPO_PUBLIC_* variable as missing when unset', () => {
    setEnv({});
    const { missingEnv, validateEnv } = loadEnvModule();
    expect(missingEnv()).toEqual(expect.arrayContaining([...REQUIRED]));
    expect(validateEnv()).toEqual({
      ok: false,
      missing: expect.arrayContaining([...REQUIRED]),
    });
  });

  it('validates ok once every required variable is set', () => {
    setEnv({
      EXPO_PUBLIC_API_URL: 'https://api.example.com',
      EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_xxx',
    });
    const { missingEnv, validateEnv, env } = loadEnvModule();
    expect(missingEnv()).toEqual([]);
    expect(validateEnv()).toEqual({ ok: true });
    expect(env.apiUrl).toBe('https://api.example.com');
  });

  it('strips trailing slashes from the API URL', () => {
    setEnv({
      EXPO_PUBLIC_API_URL: 'https://api.example.com///',
      EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_xxx',
    });
    const { env } = loadEnvModule();
    expect(env.apiUrl).toBe('https://api.example.com');
  });

  it.each([
    [
      'https://app.example.com',
      'https://api.example.com/functions/v1/api',
      'https://app.example.com',
    ],
    [
      'https://app.example.com/path/',
      'https://api.example.com',
      'https://app.example.com',
    ],
    ['', 'https://api.example.com/functions/v1/api', 'https://api.example.com'],
    ['', 'http://127.0.0.1:54321/functions/v1/api', 'http://127.0.0.1:54321'],
    ['', '', ''],
  ])('companion origin %j with API %j is %j', (companion, api, expected) => {
    setEnv({ EXPO_PUBLIC_API_URL: api });
    process.env.EXPO_PUBLIC_COMPANION_ORIGIN = companion;
    expect(loadEnvModule().companionOrigin).toBe(expected);
  });

  it('does not require the companion origin', () => {
    setEnv({
      EXPO_PUBLIC_API_URL: 'https://api.example.com',
      EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_xxx',
    });
    delete process.env.EXPO_PUBLIC_COMPANION_ORIGIN;
    expect(loadEnvModule().validateEnv()).toEqual({ ok: true });
  });
});
