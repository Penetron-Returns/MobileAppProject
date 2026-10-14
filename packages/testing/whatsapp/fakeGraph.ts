/** Fake Meta Graph client that records calls. No network. */
import type { FlowSummary, GraphClient, TemplateSummary } from '@booking/app-store/whatsapp/graph.ts';

// ---------------------------------------------------------------- fake graph

export interface GraphCall {
  method: keyof GraphClient;
  args: unknown[];
  token: string;
}

export interface FakeGraph {
  calls: GraphCall[];
  sent: { phoneNumberId: string; payload: Record<string, unknown> }[];
  /** Make the next N sendMessage calls throw this */
  failNext: (err: Error, times?: number) => void;
  factory: (token: string) => GraphClient;
  flows: FlowSummary[];
  templates: TemplateSummary[];
  debugExpiresAt: Date | null;
}

export function fakeGraph(): FakeGraph {
  let seq = 0;
  let failure: { err: Error; times: number } | null = null;
  const state: FakeGraph = {
    calls: [],
    sent: [],
    flows: [],
    templates: [],
    debugExpiresAt: null,
    failNext: (err, times = 1) => {
      failure = { err, times };
    },
    factory: (token) => {
      const rec = (method: keyof GraphClient, ...args: unknown[]) => state.calls.push({ method, args, token });
      return {
        async sendMessage(phoneNumberId, payload) {
          rec('sendMessage', phoneNumberId, payload);
          if (failure && failure.times > 0) {
            failure.times -= 1;
            throw failure.err;
          }
          state.sent.push({ phoneNumberId, payload });
          seq += 1;
          return { wamid: `wamid.out.${seq}` };
        },
        async markAsRead(...a) {
          rec('markAsRead', ...a);
        },
        async getPhoneNumber(id) {
          rec('getPhoneNumber', id);
          return { id, display_phone_number: '+27 82 000 0000', verified_name: 'Nadia Hair', quality_rating: 'GREEN', messaging_limit_tier: 'TIER_1K' };
        },
        async subscribeApp(...a) {
          rec('subscribeApp', ...a);
        },
        async unsubscribeApp(...a) {
          rec('unsubscribeApp', ...a);
        },
        async registerNumber(...a) {
          rec('registerNumber', ...a);
        },
        async uploadFlowPublicKey(...a) {
          rec('uploadFlowPublicKey', ...a);
        },
        async listFlows(...a) {
          rec('listFlows', ...a);
          return structuredClone(state.flows);
        },
        async createFlow(wabaId, input) {
          rec('createFlow', wabaId, input);
          const id = `flow-${input.name}`;
          state.flows.push({ id, name: input.name, status: input.publish ? 'PUBLISHED' : 'DRAFT' });
          return { id, validationErrors: [] };
        },
        async updateFlowJson(...a) {
          rec('updateFlowJson', ...a);
          return { validationErrors: [] };
        },
        async updateFlowMetadata(...a) {
          rec('updateFlowMetadata', ...a);
        },
        async publishFlow(id) {
          rec('publishFlow', id);
          const f = state.flows.find((x) => x.id === id);
          if (f) f.status = 'PUBLISHED';
        },
        async listTemplates(...a) {
          rec('listTemplates', ...a);
          return structuredClone(state.templates);
        },
        async createTemplate(wabaId, t) {
          rec('createTemplate', wabaId, t);
          const id = `tpl-${String(t.name)}`;
          state.templates.push({ id, name: String(t.name), language: String(t.language), status: 'PENDING', category: 'UTILITY' });
          return { id, status: 'PENDING' };
        },
        async exchangeCode(...a) {
          rec('exchangeCode', ...a);
          return { accessToken: 'EAAG-business-token' };
        },
        async debugToken(...a) {
          rec('debugToken', ...a);
          return { isValid: true, expiresAt: state.debugExpiresAt, scopes: [] };
        },
        async exchangeLongLived(...a) {
          rec('exchangeLongLived', ...a);
          return { accessToken: 'EAAG-long-lived', expiresIn: 60 * 24 * 3600 };
        },
      };
    },
  };
  return state;
}

