-- =============================================================================
-- 0006 · Realtime publication and Storage buckets
-- Both blocks are guarded so plain Postgres (CI, local tests) still migrates.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Realtime: BUILD_PLAN §3 → appointments, conversations, messages, escalations,
-- clients. Realtime applies the SELECT policies above per subscriber.
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'publication supabase_realtime not found; skipping realtime setup';
    return;
  end if;
  if (select puballtables from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publishes all tables; nothing to add';
    return;
  end if;

  foreach t in array array['appointments', 'conversations', 'messages', 'escalations', 'clients']
  loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- Storage buckets
--   logos, staff-photos : public read (served via the public URL), members of a
--                         business may write objects under `<business_id>/…`
--   whatsapp-media      : private, service role only (no policies)
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema not found; skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values
    ('logos',          'logos',          true,  5242880,
       array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']),
    ('staff-photos',   'staff-photos',   true,  5242880,
       array['image/png', 'image/jpeg', 'image/webp']),
    ('whatsapp-media', 'whatsapp-media', false, 104857600, null)
  on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists "members read business assets" on storage.objects';
  execute 'drop policy if exists "members upload business assets" on storage.objects';
  execute 'drop policy if exists "members update business assets" on storage.objects';
  execute 'drop policy if exists "members delete business assets" on storage.objects';

  -- `(storage.foldername(name))[1]` is the first path segment.
  execute $p$
    create policy "members read business assets" on storage.objects
      for select to authenticated
      using (
        bucket_id in ('logos', 'staff-photos')
        and (storage.foldername(name))[1] = (select private.current_business_id())::text
      )
  $p$;
  execute $p$
    create policy "members upload business assets" on storage.objects
      for insert to authenticated
      with check (
        bucket_id in ('logos', 'staff-photos')
        and (storage.foldername(name))[1] = (select private.current_business_id())::text
      )
  $p$;
  execute $p$
    create policy "members update business assets" on storage.objects
      for update to authenticated
      using (
        bucket_id in ('logos', 'staff-photos')
        and (storage.foldername(name))[1] = (select private.current_business_id())::text
      )
      with check (
        bucket_id in ('logos', 'staff-photos')
        and (storage.foldername(name))[1] = (select private.current_business_id())::text
      )
  $p$;
  execute $p$
    create policy "members delete business assets" on storage.objects
      for delete to authenticated
      using (
        bucket_id in ('logos', 'staff-photos')
        and (storage.foldername(name))[1] = (select private.current_business_id())::text
      )
  $p$;
end
$$;
