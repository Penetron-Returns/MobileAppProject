-- Emits one JSON document describing the `public` schema (tables, views,
-- relationships, functions, enums) for scripts/db/gen-types.mjs.
-- Run with: psql -At -f scripts/db/introspect.sql
with
ext_objects as (
  select objid from pg_depend where deptype = 'e'
),
enums as (
  select t.typname as name,
         jsonb_agg(e.enumlabel order by e.enumsortorder) as values
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    join pg_enum e on e.enumtypid = t.oid
   where n.nspname = 'public'
   group by t.typname
),
rels as (
  select c.oid, c.relname, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
     and c.oid not in (select objid from ext_objects)
),
cols as (
  select a.attrelid,
         jsonb_agg(jsonb_build_object(
           'name',      a.attname,
           'type',      case when t.typcategory = 'A' then et.typname else t.typname end,
           'typeSchema', case when t.typcategory = 'A' then etn.nspname else tn.nspname end,
           'typeKind',  case when t.typcategory = 'A' then et.typtype else t.typtype end,
           'isArray',   t.typcategory = 'A',
           'nullable',  not a.attnotnull,
           'hasDefault', a.atthasdef,
           'identity',  a.attidentity,
           'generated', a.attgenerated
         ) order by a.attnum) as columns
    from pg_attribute a
    join pg_type t on t.oid = a.atttypid
    join pg_namespace tn on tn.oid = t.typnamespace
    left join pg_type et on et.oid = t.typelem and t.typcategory = 'A'
    left join pg_namespace etn on etn.oid = et.typnamespace
   where a.attnum > 0 and not a.attisdropped
     and a.attrelid in (select oid from rels)
   group by a.attrelid
),
uniq as (
  -- column-name sets that are unique on each relation (pk / unique constraints / unique indexes, non-partial)
  select i.indrelid,
         array(select att.attname::text from unnest(i.indkey) with ordinality k(attnum, ord)
                 join pg_attribute att on att.attrelid = i.indrelid and att.attnum = k.attnum
                order by att.attname) as cols
    from pg_index i
   where i.indisunique and i.indpred is null and i.indexprs is null
),
fks as (
  select con.conrelid,
         jsonb_agg(jsonb_build_object(
           'foreignKeyName', con.conname,
           'columns', (select jsonb_agg(att.attname order by k.ord)
                         from unnest(con.conkey) with ordinality k(attnum, ord)
                         join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum),
           'isOneToOne', exists (
              select 1 from uniq u
               where u.indrelid = con.conrelid
                 and u.cols = array(select att.attname::text from unnest(con.conkey) k(attnum)
                                      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
                                     order by att.attname)),
           'referencedRelation', fc.relname,
           'referencedColumns', (select jsonb_agg(att.attname order by k.ord)
                                   from unnest(con.confkey) with ordinality k(attnum, ord)
                                   join pg_attribute att on att.attrelid = con.confrelid and att.attnum = k.attnum)
         )) as relationships
    from pg_constraint con
    join pg_class fc on fc.oid = con.confrelid
    join pg_namespace fn on fn.oid = fc.relnamespace
   where con.contype = 'f' and fn.nspname = 'public'
     and con.conrelid in (select oid from rels)
   group by con.conrelid
),
funcs as (
  select jsonb_agg(jsonb_build_object(
           'name',          p.proname,
           'nargs',         p.pronargs,
           'nargdefaults',  p.pronargdefaults,
           'retset',        p.proretset,
           'args', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'name',     coalesce(p.proargnames[k.ord], ''),
                      'mode',     coalesce(p.proargmodes[k.ord], 'i'),
                      'type',     case when t.typcategory = 'A' then et.typname else t.typname end,
                      'typeKind', case when t.typcategory = 'A' then et.typtype else t.typtype end,
                      'isArray',  t.typcategory = 'A'
                    ) order by k.ord), '[]'::jsonb)
               from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality k(typ, ord)
               join pg_type t on t.oid = k.typ
               left join pg_type et on et.oid = t.typelem and t.typcategory = 'A'
           ),
           'returnType',     case when rt.typcategory = 'A' then ret.typname else rt.typname end,
           'returnTypeKind', case when rt.typcategory = 'A' then ret.typtype else rt.typtype end,
           'returnIsArray',  rt.typcategory = 'A',
           'returnRelation', rc.relname
         ) order by p.proname, p.oid) as functions
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_type rt on rt.oid = p.prorettype
    left join pg_type ret on ret.oid = rt.typelem and rt.typcategory = 'A'
    left join pg_class rc on rc.oid = rt.typrelid and rc.relnamespace = n.oid
   where n.nspname = 'public' and p.prokind = 'f'
     and p.oid not in (select objid from ext_objects)
     and rt.typname <> 'trigger'
)
select jsonb_build_object(
  'enums', coalesce((select jsonb_object_agg(name, values) from enums), '{}'::jsonb),
  'tables', coalesce((
     select jsonb_agg(jsonb_build_object(
              'name', r.relname,
              'kind', r.relkind,
              'columns', coalesce(c.columns, '[]'::jsonb),
              'relationships', coalesce(f.relationships, '[]'::jsonb)
            ) order by r.relname)
       from rels r
       left join cols c on c.attrelid = r.oid
       left join fks f on f.conrelid = r.oid), '[]'::jsonb),
  'functions', coalesce((select functions from funcs), '[]'::jsonb)
)::text;
