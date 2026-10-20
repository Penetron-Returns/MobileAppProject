import { beforeEach, describe, expect, it } from 'vitest';

import bookingFlow from '@booking/app-store/whatsapp/assets/flows/booking.json' with { type: 'json' };
import rescheduleFlow from '@booking/app-store/whatsapp/assets/flows/reschedule.json' with { type: 'json' };

type Node = Record<string, unknown> & { type?: string; children?: Node[]; then?: Node[] };
interface Screen {
  id: string;
  title: string;
  terminal?: boolean;
  success?: boolean;
  refresh_on_back?: boolean;
  data: Record<string, { type: string; __example__: unknown }>;
  layout: { type: string; children: Node[] };
}
type FlowJson = { version: string; data_api_version: string; routing_model: Record<string, string[]>; screens: Screen[] };
let flow: FlowJson;

const walk = (nodes: Node[]): Node[] => nodes.flatMap((n) => [n, ...walk(n.children ?? []), ...walk(n.then ?? [])]);
const components = (s: Screen) => walk(s.layout.children);
const screen = (id: string) => flow.screens.find((s) => s.id === id)!;
const footer = (id: string) => components(screen(id)).find((n) => n.type === 'Footer')! as Node & { 'on-click-action': { name: string; payload: Record<string, string> } };

const FLOWS = [
  { file: 'booking.json', json: bookingFlow, screens: ['SERVICE', 'DATETIME', 'SUMMARY'], routing: { SERVICE: ['DATETIME'], DATETIME: ['SUMMARY'], SUMMARY: [] } },
  { file: 'reschedule.json', json: rescheduleFlow, screens: ['DATETIME', 'SUMMARY'], routing: { DATETIME: ['SUMMARY'], SUMMARY: [] } },
];

describe.each(FLOWS)('$file (Meta Flow JSON shape)', ({ json, screens, routing }) => {
  beforeEach(() => {
    flow = json as unknown as FlowJson;
  });

  it('declares version 7.3, data API 3.0 and its routing', () => {
    expect(flow.version).toBe('7.3');
    expect(flow.data_api_version).toBe('3.0');
    expect(flow.screens.map((s) => s.id)).toEqual(screens);
    expect(flow.routing_model).toEqual(routing);
  });

  it('routes only to declared screens, and a screen with no outgoing edge is terminal', () => {
    const ids = new Set(flow.screens.map((s) => s.id));
    for (const s of flow.screens) {
      expect(flow.routing_model[s.id]).toBeDefined();
      for (const next of flow.routing_model[s.id]!) expect(ids.has(next)).toBe(true);
      expect(!!s.terminal).toBe(flow.routing_model[s.id]!.length === 0);
    }
  });

  it('ends on a terminal success SUMMARY whose footer uses complete, and exchanges data everywhere else', () => {
    expect(screen('SUMMARY')).toMatchObject({ terminal: true, success: true });
    expect(footer('SUMMARY')['on-click-action'].name).toBe('complete');
    for (const s of flow.screens.filter((x) => x.id !== 'SUMMARY')) expect(footer(s.id)['on-click-action'].name).toBe('data_exchange');
  });

  it('refreshes DATETIME on back so a stale time grid is never shown', () => {
    expect(screen('DATETIME').refresh_on_back).toBe(true);
  });

  it('renders the SUMMARY recap as a markdown TextBody (Meta rejected RichText here)', () => {
    const recap = components(screen('SUMMARY')).find((n) => n.text === '${data.summary_text}')!;
    expect(recap).toMatchObject({ type: 'TextBody', markdown: true });
    expect(JSON.stringify(flow)).not.toContain('RichText');
  });

  it('only uses whole-value bindings, never backtick expressions', () => {
    const bad: string[] = [];
    const visit = (v: unknown, path: string) => {
      if (typeof v === 'string') {
        if (v.startsWith('`') || (v.includes('${') && !/^\$\{[^}]+\}$/.test(v))) bad.push(`${path}: ${v}`);
      } else if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${path}[${i}]`));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) visit(x, `${path}.${k}`);
    };
    visit(flow, 'flow');
    expect(bad).toEqual([]);
  });

  it('declares every data.* binding in its screen data with an example, and stays within 50 components', () => {
    for (const s of flow.screens) {
      const used = [...JSON.stringify(s.layout).matchAll(/\$\{data\.([a-z_]+)\}/g)].map((m) => m[1]!);
      for (const key of used) expect(s.data[key], `${s.id}.${key}`).toBeDefined();
      for (const [key, def] of Object.entries(s.data)) expect(def.__example__, `${s.id}.${key} example`).not.toBeUndefined();
      expect(components(s).length).toBeLessThanOrEqual(50);
    }
  });

  it('keeps unique form field names per screen and bounded titles', () => {
    for (const s of flow.screens) {
      const names = components(s).map((n) => n.name).filter((n): n is string => typeof n === 'string');
      expect(new Set(names).size).toBe(names.length);
      expect(s.title.length).toBeLessThanOrEqual(30);
    }
  });
});

type Action = { name: string; payload: unknown };
const picker = () => components(screen('DATETIME')).find((n) => n.type === 'CalendarPicker') as Node & { 'on-select-action': Action };

describe('booking.json data-exchange contract', () => {
  beforeEach(() => {
    flow = bookingFlow as unknown as FlowJson;
  });

  it('keeps the payloads the backend serves', () => {
    expect(footer('SERVICE')['on-click-action'].payload).toEqual({ trigger: 'service_selected', service: '${form.service}' });
    expect(picker()['on-select-action']).toEqual({
      name: 'data_exchange',
      payload: { trigger: 'date_selected', service: '${data.service_slug}', date: '${form.appointment_date}' },
    });
    expect(footer('DATETIME')['on-click-action'].payload).toMatchObject({ trigger: 'continue', service_slug: '${data.service_slug}', time: '${form.appointment_time}' });
    expect(Object.keys(footer('SUMMARY')['on-click-action'].payload).sort()).toEqual(['duration_minutes', 'service_slug', 'start_time_iso', 'timezone']);
  });
});

describe('reschedule.json data-exchange contract', () => {
  beforeEach(() => {
    flow = rescheduleFlow as unknown as FlowJson;
  });

  it('keeps the payloads the backend serves, with no service or appointment chosen client-side', () => {
    expect(picker()['on-select-action']).toEqual({ name: 'data_exchange', payload: { trigger: 'date_selected', date: '${form.appointment_date}' } });
    expect(footer('DATETIME')['on-click-action'].payload).toEqual({ trigger: 'continue', time: '${form.appointment_time}' });
    expect(footer('SUMMARY')['on-click-action'].payload).toEqual({
      appointment_id: '${data.appointment_id}',
      start_time_iso: '${data.start_time_iso}',
      timezone: '${data.timezone}',
    });
  });

  it('has no data_exchange on the terminal screen (Meta rejects it)', () => {
    expect(JSON.stringify(screen('SUMMARY'))).not.toContain('data_exchange');
  });
});
