-- =====================================================================
-- TURNO · Seguridad: las funciones-trigger (SECURITY DEFINER) no deben
-- ser invocables vía REST. Solo se ejecutan como triggers.
-- =====================================================================
revoke execute on function public.turno_actualizar_confiabilidad() from public, anon, authenticated;
revoke execute on function public.turno_acumular_puntos()          from public, anon, authenticated;
revoke execute on function public.turno_cita_a_cola_prioritaria()  from public, anon, authenticated;
revoke execute on function public.turno_registrar_visita_cita()    from public, anon, authenticated;
revoke execute on function public.turno_registrar_visita_cola()    from public, anon, authenticated;
revoke execute on function public.turno_marcar_ausentes_grupo()    from public, anon, authenticated;
revoke execute on function public.turno_set_updated_at()           from public, anon, authenticated;
