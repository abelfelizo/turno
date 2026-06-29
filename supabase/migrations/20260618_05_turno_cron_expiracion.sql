-- =====================================================================
-- TURNO · Fase 1 · Migración 5: cron de expiración (cada minuto)
-- Ejecuta turno_expirar_llamados() para vencer llamados sin respuesta
-- (casos 5/15) y citas no confirmadas (caso 13).
-- =====================================================================

-- desprogramar si ya existía (idempotente)
select cron.unschedule('turno_expirar_llamados')
where exists (select 1 from cron.job where jobname = 'turno_expirar_llamados');

select cron.schedule(
  'turno_expirar_llamados',
  '* * * * *',
  $$ select public.turno_expirar_llamados(); $$
);
