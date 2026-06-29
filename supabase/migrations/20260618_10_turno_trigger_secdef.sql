-- =====================================================================
-- TURNO · Fix: triggers que modifican datos de OTROS usuarios/tablas
-- deben ser SECURITY DEFINER. Si corren como invoker, RLS bloquea
-- (p.ej. el barbero no puede incrementar no_shows del cliente).
-- Bug detectado en prueba E2E: confiabilidad nunca se actualizaba.
-- =====================================================================
alter function public.turno_actualizar_confiabilidad() security definer;
alter function public.turno_acumular_puntos()          security definer;
alter function public.turno_cita_a_cola_prioritaria()  security definer;
alter function public.turno_registrar_visita_cita()    security definer;
alter function public.turno_registrar_visita_cola()    security definer;
alter function public.turno_marcar_ausentes_grupo()    security definer;
