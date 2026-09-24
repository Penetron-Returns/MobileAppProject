/** Member routes: clients and client notes. */
import { Hono } from 'hono';

import { addClientNote, deleteClientNote, updateClient, upsertClient } from '../../booking/admin';
import { parseJson } from '../../lib/validation';
import type { AppEnv } from '../../types';
import { deps, idParam } from './context';
import { createClientNoteSchema, createClientSchema, updateClientSchema } from './schemas';

export const clientRoutes = new Hono<AppEnv>();

/** Creates the client, or returns the existing one for that phone with the given fields applied. */
clientRoutes.post('/clients', async (c) => {
  const { repo, auth } = deps(c);
  const body = await parseJson(c, createClientSchema);
  return c.json({ data: await upsertClient(repo, auth.businessId, body) }, 201);
});

clientRoutes.patch('/clients/:id', async (c) => {
  const { repo, auth } = deps(c);
  const id = idParam(c);
  const body = await parseJson(c, updateClientSchema);
  return c.json({ data: await updateClient(repo, auth.businessId, id, body) });
});

clientRoutes.post('/clients/:id/notes', async (c) => {
  const { repo, auth } = deps(c);
  const id = idParam(c);
  const body = await parseJson(c, createClientNoteSchema);
  return c.json({ data: await addClientNote(repo, auth.businessId, id, auth.userId, body) }, 201);
});

clientRoutes.delete('/clients/:id/notes/:noteId', async (c) => {
  const { repo, auth } = deps(c);
  const data = await deleteClientNote(repo, auth.businessId, idParam(c), idParam(c, 'noteId'));
  return c.json({ data });
});
