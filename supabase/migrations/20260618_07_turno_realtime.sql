-- =====================================================================
-- TURNO · Fase 2 · Migración 7: habilitar Realtime en tablas turno_
-- Sin esto, las suscripciones (cola en vivo, agenda, estado de barberos)
-- conectan pero NUNCA reciben eventos. Solo tablas turno_.
-- =====================================================================
alter publication supabase_realtime add table public.turno_cola;
alter publication supabase_realtime add table public.turno_citas;
alter publication supabase_realtime add table public.turno_perfiles;
