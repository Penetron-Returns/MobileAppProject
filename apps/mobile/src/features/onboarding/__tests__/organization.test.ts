import { ensureOrganization } from '../organization';

const deps = (
  over: Partial<Parameters<typeof ensureOrganization>[0]> = {},
) => ({
  userId: 'user_1',
  activeOrgId: null,
  listOwnedOrgIds: jest.fn().mockResolvedValue([]),
  create: jest.fn().mockResolvedValue('org_new'),
  ...over,
});

describe('ensureOrganization', () => {
  it('reuses the active organisation without creating', async () => {
    const d = deps({ activeOrgId: 'org_active' });
    await expect(ensureOrganization(d)).resolves.toBe('org_active');
    expect(d.create).not.toHaveBeenCalled();
    expect(d.listOwnedOrgIds).not.toHaveBeenCalled();
  });

  it('reuses an owned organisation that is not active yet', async () => {
    const d = deps({
      listOwnedOrgIds: jest.fn().mockResolvedValue(['org_old']),
    });
    await expect(ensureOrganization(d)).resolves.toBe('org_old');
    expect(d.create).not.toHaveBeenCalled();
  });

  it('creates exactly one organisation for concurrent calls', async () => {
    const d = deps();
    const ids = await Promise.all([
      ensureOrganization(d),
      ensureOrganization(d),
    ]);
    expect(ids).toEqual(['org_new', 'org_new']);
    expect(d.create).toHaveBeenCalledTimes(1);
  });

  it('retries after a failed create, and a later call finds what exists', async () => {
    const failing = deps({
      create: jest.fn().mockRejectedValue(new Error('x')),
    });
    await expect(ensureOrganization(failing)).rejects.toThrow('x');
    const retry = deps({
      listOwnedOrgIds: jest.fn().mockResolvedValue(['org_new']),
    });
    await expect(ensureOrganization(retry)).resolves.toBe('org_new');
    expect(retry.create).not.toHaveBeenCalled();
  });

  it('keeps different users apart', async () => {
    const a = deps({
      userId: 'a',
      create: jest.fn().mockResolvedValue('org_a'),
    });
    const b = deps({
      userId: 'b',
      create: jest.fn().mockResolvedValue('org_b'),
    });
    await expect(
      Promise.all([ensureOrganization(a), ensureOrganization(b)]),
    ).resolves.toEqual(['org_a', 'org_b']);
  });
});
