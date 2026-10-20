/** /v1/me/deletion-preview and DELETE /v1/me: the signed-in user deletes their own account (any role). */
import { Hono } from 'hono';

import {
  deleteAccount,
  previewAccountDeletion,
  type AccountCaller,
  type AccountDeps,
} from '@booking/features/team/services/account.ts';
import type { AppEnv } from '../../types.ts';
import { deps, parseOptionalJson, type Ctx } from './context.ts';
import { deleteAccountSchema } from './schemas.ts';

function account(c: Ctx): { deps: AccountDeps; caller: AccountCaller } {
  const { repo, auth } = deps(c);
  const container = c.get('container');
  return {
    deps: { repo, clerk: container.clerkAdmin },
    // Org and business always come from the verified token, never from the request.
    caller: { userId: auth.userId, orgId: auth.orgId, businessId: auth.businessId, role: auth.role, requestId: c.get('requestId') },
  };
}

export const accountRoutes = new Hono<AppEnv>();

accountRoutes.get('/me/deletion-preview', async (c) => {
  const a = account(c);
  return c.json({ data: await previewAccountDeletion(a.deps, a.caller) });
});

accountRoutes.delete('/me', async (c) => {
  const body = await parseOptionalJson(c, deleteAccountSchema);
  const a = account(c);
  const result = await deleteAccount(a.deps, a.caller, {
    ...(body.confirm_business_name === undefined ? {} : { confirmBusinessName: body.confirm_business_name }),
  });
  return c.json({ data: result });
});
