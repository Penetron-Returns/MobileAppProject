import { createPrefetcher } from '../todayPrefetch';
import { clipUploadMeta } from '../transcribe';

describe('createPrefetcher', () => {
  let clock = 1_000;
  const make = (load: () => Promise<string>) =>
    createPrefetcher({ load, now: () => clock, ttlMs: 30_000 });
  beforeEach(() => {
    clock = 1_000;
  });

  it('hands out the prefetched value once', async () => {
    const load = jest.fn().mockResolvedValue('today');
    const p = make(load);
    await p.prefetch();
    await expect(p.take()).resolves.toBe('today');
    expect(p.take()).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('lets a command wait on a load that is still running', async () => {
    let finish!: (v: string) => void;
    const p = make(() => new Promise<string>((r) => (finish = r)));
    void p.prefetch();
    const taken = p.take();
    finish('late');
    await expect(taken).resolves.toBe('late');
  });

  it('is empty before any prefetch', () => {
    expect(make(jest.fn()).take()).toBeNull();
  });

  it('drops a value older than the ttl', async () => {
    const p = make(async () => 'old');
    await p.prefetch();
    clock += 30_001;
    expect(p.take()).toBeNull();
  });

  it('keeps a value exactly at the ttl', async () => {
    const p = make(async () => 'edge');
    await p.prefetch();
    clock += 30_000;
    await expect(p.take()).resolves.toBe('edge');
  });

  it('forgets a failed load without rejecting, so the command loads for itself', async () => {
    const p = make(() => Promise.reject(new Error('offline')));
    await expect(p.prefetch()).resolves.toBeUndefined();
    expect(p.take()).toBeNull();
  });

  it('a newer prefetch replaces an older one', async () => {
    const values = ['first', 'second'];
    const p = make(async () => values.shift() as string);
    await p.prefetch();
    await p.prefetch();
    await expect(p.take()).resolves.toBe('second');
  });
});

describe('clipUploadMeta', () => {
  it.each([
    ['/data/user/0/app/cache/clovie-clip-1.m4a', 'clip.m4a', 'audio/mp4'],
    ['/cache/CLIP.M4A', 'clip.m4a', 'audio/mp4'],
    ['/cache/clovie-clip-1.wav', 'clip.wav', 'audio/wav'],
    ['/cache/unknown', 'clip.wav', 'audio/wav'],
  ])('%s uploads as %s (%s)', (path, name, type) => {
    expect(clipUploadMeta(path)).toEqual({ name, type });
  });
});
