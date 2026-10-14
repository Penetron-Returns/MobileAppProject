#!/usr/bin/env node
// Reads the JSON produced by scripts/db/introspect.sql on stdin and prints a
// Supabase-style `Database` type (the shape `supabase gen types typescript`
// emits for postgrest-js v2) on stdout.
//
// Used by scripts/db/gen-types.sh (writes packages/database/database.types.ts) and by
// scripts/db/test.sh (fails when the committed file is stale). Once the
// project is linked, `supabase gen types typescript --linked --schema public`
// produces an equivalent file; the runtime `Constants` export it adds is
// deliberately omitted because this file is types-only.

import { readFileSync } from 'node:fs';

const schema = JSON.parse(readFileSync(0, 'utf8'));
const byName = (a, b) => a.localeCompare(b);

const ENUM_REF = (name) => `Database["public"]["Enums"]["${name}"]`;

function scalarType({ type, typeKind }) {
  if (typeKind === 'e') return ENUM_REF(type);
  switch (type) {
    case 'bool':
      return 'boolean';
    case 'int2':
    case 'int4':
    case 'int8':
    case 'float4':
    case 'float8':
    case 'numeric':
      return 'number';
    case 'bytea':
    case 'bpchar':
    case 'varchar':
    case 'date':
    case 'text':
    case 'citext':
    case 'time':
    case 'timetz':
    case 'timestamp':
    case 'timestamptz':
    case 'uuid':
    case 'vector':
      return 'string';
    case 'json':
    case 'jsonb':
      return 'Json';
    case 'void':
      return 'undefined';
    case 'record':
      return 'Record<string, unknown>';
    default:
      return 'unknown'; // ranges (tstzrange) etc., as the Supabase generator does
  }
}

const tsType = (t) => (t.isArray ? `${scalarType(t)}[]` : scalarType(t));

const tablesByName = new Map(schema.tables.map((t) => [t.name, t]));

function indent(lines, n) {
  const pad = ' '.repeat(n);
  return lines.map((l) => (l ? pad + l : l));
}

function columnLines(columns, mode) {
  return [...columns]
    .sort((a, b) => byName(a.name, b.name))
    .map((c) => {
      const base = tsType(c);
      const nullable = c.nullable ? ' | null' : '';
      if (mode === 'Row') return `${c.name}: ${base}${nullable}`;
      const neverWritable = c.generated === 's' || c.identity === 'a';
      if (neverWritable) return `${c.name}?: never`;
      if (mode === 'Update') return `${c.name}?: ${base}${nullable}`;
      const optional = c.nullable || c.hasDefault || c.identity === 'd';
      return `${c.name}${optional ? '?' : ''}: ${base}${nullable}`;
    });
}

function relationshipLines(rels) {
  if (!rels.length) return ['Relationships: []'];
  const sorted = [...rels].sort(
    (a, b) => byName(a.foreignKeyName, b.foreignKeyName) || byName(a.referencedRelation, b.referencedRelation),
  );
  const out = ['Relationships: ['];
  for (const r of sorted) {
    out.push(
      '  {',
      `    foreignKeyName: "${r.foreignKeyName}"`,
      `    columns: [${r.columns.map((c) => `"${c}"`).join(', ')}]`,
      `    isOneToOne: ${r.isOneToOne}`,
      `    referencedRelation: "${r.referencedRelation}"`,
      `    referencedColumns: [${r.referencedColumns.map((c) => `"${c}"`).join(', ')}]`,
      '  },',
    );
  }
  out.push(']');
  return out;
}

function block(name, lines) {
  if (!lines.length) return [`${name}: {`, '  [_ in never]: never', '}'];
  return [`${name}: {`, ...indent(lines, 2), '}'];
}

function objectType(lines) {
  return ['{', ...indent(lines, 2), '}'];
}

// ---------------------------------------------------------------- tables
const tableLines = [];
const viewLines = [];
for (const t of [...schema.tables].sort((a, b) => byName(a.name, b.name))) {
  const isView = t.kind === 'v' || t.kind === 'm';
  const body = [
    ...block('Row', columnLines(t.columns, 'Row')),
    ...(isView && t.kind === 'm' ? [] : block('Insert', columnLines(t.columns, 'Insert'))),
    ...(isView && t.kind === 'm' ? [] : block('Update', columnLines(t.columns, 'Update'))),
    ...relationshipLines(t.relationships),
  ];
  (isView ? viewLines : tableLines).push(...block(t.name, body));
}

// ---------------------------------------------------------------- functions
function fnReturn(fn) {
  const outArgs = fn.args.filter((a) => a.mode === 't');
  if (outArgs.length) {
    const cols = outArgs
      .sort((a, b) => byName(a.name, b.name))
      .map((a) => `${a.name}: ${tsType(a)}`);
    return { returns: [...objectType(cols).slice(0, -1), '}[]'] };
  }
  if (fn.returnRelation && tablesByName.has(fn.returnRelation)) {
    const table = tablesByName.get(fn.returnRelation);
    const cols = objectType(columnLines(table.columns, 'Row'));
    return {
      returns: fn.retset ? [...cols.slice(0, -1), '}[]'] : cols,
      setof: [
        'SetofOptions: {',
        '  from: "*"',
        `  to: "${fn.returnRelation}"`,
        `  isOneToOne: ${!fn.retset}`,
        `  isSetofReturn: ${fn.retset}`,
        '}',
      ],
    };
  }
  const t = tsType({ type: fn.returnType, typeKind: fn.returnTypeKind, isArray: fn.returnIsArray });
  return { returns: [fn.retset ? `${t}[]` : t] };
}

const functionLines = [];
for (const fn of [...schema.functions].sort((a, b) => byName(a.name, b.name))) {
  const inArgs = fn.args.filter((a) => a.mode === 'i' || a.mode === 'b' || a.mode === 'v');
  const firstDefault = inArgs.length - fn.nargdefaults;
  const argLines = inArgs
    .map((a, i) => ({ ...a, optional: i >= firstDefault }))
    .filter((a) => a.name)
    .sort((a, b) => byName(a.name, b.name))
    .map((a) => `${a.name}${a.optional ? '?' : ''}: ${tsType(a)}`);
  const { returns, setof } = fnReturn(fn);
  const body = [
    ...(argLines.length ? block('Args', argLines) : ['Args: never']),
    ...(returns.length === 1 ? [`Returns: ${returns[0]}`] : [`Returns: ${returns[0]}`, ...returns.slice(1)]),
    ...(setof ?? []),
  ];
  functionLines.push(...block(fn.name, body));
}

// ---------------------------------------------------------------- enums
const enumLines = Object.keys(schema.enums)
  .sort(byName)
  .map((name) => {
    const values = schema.enums[name];
    return `${name}: ${values.map((v) => `"${v}"`).join(' | ')}`;
  });

const publicSchema = [
  ...block('Tables', tableLines),
  ...block('Views', viewLines),
  ...block('Functions', functionLines),
  ...block('Enums', enumLines),
  ...block('CompositeTypes', []),
];

const header = `/**
 * Supabase \`Database\` type for the \`public\` schema.
 *
 * GENERATED from packages/database/supabase/migrations by scripts/db/gen-types.sh. Do not edit by
 * hand: change a migration, then regenerate. scripts/db/test.sh fails when this
 * file is out of date. Format matches \`supabase gen types typescript\`
 * (postgrest-js v2), minus the runtime \`Constants\` export (this file is types-only).
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]
`;

const helpers = `
type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
`;

const database = [
  'export type Database = {',
  '  // Allows to automatically instantiate createClient with right options',
  "  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)",
  '  __InternalSupabase: {',
  '    PostgrestVersion: "12"',
  '  }',
  ...indent(block('public', publicSchema), 2),
  '}',
].join('\n');

process.stdout.write(`${header}\n${database}\n${helpers}`);
