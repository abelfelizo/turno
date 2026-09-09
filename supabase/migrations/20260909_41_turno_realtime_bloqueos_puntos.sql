-- LO QUE NO LLEGABA SOLO
--
-- Dos síntomas del piloto con la misma causa: la publicación de realtime solo
-- llevaba turno_cola, turno_citas y turno_perfiles.
--
--   · "Al atender un cliente sin cita... la veo pero no se puso automático,
--     hubo que actualizar." → la silla ocupada es una fila de turno_bloqueos,
--     y nadie estaba escuchando esa tabla. Ningún evento, ningún refresco.
--
--   · "Los puntos de fidelidad no se actualizaron en el cliente." → además de
--     no estar configurados (migración 40), turno_puntos tampoco emitía
--     eventos, así que el cliente veía su saldo viejo hasta reabrir la app.
--
-- Añadirlas a la publicación no abre nada: RLS sigue decidiendo qué filas ve
-- cada quien, y las políticas de ambas tablas ya limitan al negocio propio.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'turno_bloqueos'
  ) then
    alter publication supabase_realtime add table public.turno_bloqueos;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'turno_puntos'
  ) then
    alter publication supabase_realtime add table public.turno_puntos;
  end if;
end $$;

-- REPLICA IDENTITY FULL: sin esto, un UPDATE solo publica la clave primaria y
-- el cliente no puede filtrar por perfil_id/usuario_id en la carga vieja.
alter table public.turno_bloqueos replica identity full;
alter table public.turno_puntos   replica identity full;
