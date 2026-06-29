-- =====================================================================
-- TURNO · Fix: restricciones únicas que faltaban para los UPSERT/ON CONFLICT
-- Sin esto fallan: trigger turno_acumular_puntos (registrar visita),
-- guardarPreferencias y guardarNotaPrivada.
-- =====================================================================
create unique index if not exists turno_puntos_usuario_negocio_uk
  on public.turno_puntos(usuario_id, negocio_id);
create unique index if not exists turno_prefs_usuario_negocio_uk
  on public.turno_preferencias_cliente(usuario_id, negocio_id);
create unique index if not exists turno_notas_perfil_cliente_uk
  on public.turno_notas_privadas(perfil_id, cliente_id);
