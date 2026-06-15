-- Private/public legal ingest buckets.
--
-- These buckets are private by default. Access should happen through
-- server-side code using the service role key, not browser clients.

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values
      ('legal-private-vault', 'legal-private-vault', false, 524288000, null),
      ('legal-public-sources', 'legal-public-sources', false, 524288000, null),
      ('legal-parsed-artifacts', 'legal-parsed-artifacts', false, 524288000, null)
    on conflict (id) do update
      set public = excluded.public,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
    execute 'comment on table storage.buckets is ''Supabase Storage buckets. Legal ingest buckets are private and accessed through server-side legal ingest services.''';
  end if;
end $$;
