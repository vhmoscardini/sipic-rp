-- SIPIC-RP — endurecimento de RLS e índices de chaves estrangeiras.

create index if not exists sipic_stations_sector_idx
  on public.sipic_stations (sector_id);

create index if not exists sipic_alerts_sector_idx
  on public.sipic_alerts (sector_id);

-- As tabelas abaixo são internas às Edge Functions. As políticas explícitas
-- mantêm anon/authenticated bloqueados e documentam a intenção de segurança.
drop policy if exists sipic_internal_deny_cache on public.sipic_api_cache;
create policy sipic_internal_deny_cache
on public.sipic_api_cache
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists sipic_internal_deny_runs on public.sipic_ingestion_runs;
create policy sipic_internal_deny_runs
on public.sipic_ingestion_runs
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists sipic_internal_deny_reports on public.sipic_reports;
create policy sipic_internal_deny_reports
on public.sipic_reports
for all
to anon, authenticated
using (false)
with check (false);

revoke all on public.sipic_api_cache from anon, authenticated;
revoke all on public.sipic_ingestion_runs from anon, authenticated;
revoke all on public.sipic_reports from anon, authenticated;
