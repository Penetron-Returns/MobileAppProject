/** /v1/team: members, invitations and roles of the business's Clerk organisation (owner only). */
import { Hono } from 'hono';
import { z } from 'zod';

import {
  changeMemberRole,
  inviteMember,
  listTeam,
  removeMember,
  revokeInvitation,
  type TeamCaller,
  type TeamDeps,
} from '@booking/features/team/services/team.ts';
import { parseJson, parseParam } from '../../lib/validation.ts';
import { requireOwner } from '../../middleware/auth.ts';
import type { AppEnv } from '../../types.ts';
import { deps, type Ctx } from './context.ts';
import { createInvitationSchema, updateMemberRoleSchema } from './schemas.ts';

/** The org id always comes from the verified token (auth.orgId), never from the request. */
function team(c: Ctx): { deps: TeamDeps; caller: TeamCaller } {
  const { repo, auth } = deps(c);
  return {
    deps: { repo, clerk: c.get('container').clerkAdmin },
    caller: { userId: auth.userId, orgId: auth.orgId, businessId: auth.businessId, requestId: c.get('requestId') },
  };
}

const clerkId = z.string().min(1).max(100);

export const teamRoutes = new Hono<AppEnv>();
teamRoutes.use('/team', requireOwner);
teamRoutes.use('/team/*', requireOwner);

teamRoutes.get('/team', async (c) => {
  const t = team(c);
  return c.json({ data: await listTeam(t.deps, t.caller) });
});

teamRoutes.post('/team/invitations', async (c) => {
  const body = await parseJson(c, createInvitationSchema);
  const t = team(c);
  const invitation = await inviteMember(t.deps, t.caller, { email: body.email, role: body.role, staffId: body.staff_id });
  return c.json({ data: invitation }, 201);
});

teamRoutes.delete('/team/invitations/:id', async (c) => {
  const id = parseParam(c, 'id', clerkId);
  const t = team(c);
  return c.json({ data: await revokeInvitation(t.deps, t.caller, id) });
});

teamRoutes.patch('/team/members/:userId', async (c) => {
  const userId = parseParam(c, 'userId', clerkId);
  const body = await parseJson(c, updateMemberRoleSchema);
  const t = team(c);
  return c.json({ data: await changeMemberRole(t.deps, t.caller, userId, body.role) });
});

teamRoutes.delete('/team/members/:userId', async (c) => {
  const userId = parseParam(c, 'userId', clerkId);
  const t = team(c);
  return c.json({ data: await removeMember(t.deps, t.caller, userId) });
});
