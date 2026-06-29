-- =====================================================================
-- TURNO · Fase 0 · Migración 3: endurecimiento de funciones turno_
-- - Fija search_path en las 7 funciones-trigger preexistentes (warning linter)
-- - Quita EXECUTE a anon/PUBLIC en los helpers (least privilege)
-- Solo objetos turno_. No toca Prestalo ni libro_*.
-- =====================================================================

-- search_path inmutable en funciones-trigger preexistentes
alter function public.turno_set_updated_at()            set search_path = public;
alter function public.turno_actualizar_confiabilidad()  set search_path = public;
alter function public.turno_acumular_puntos()           set search_path = public;
alter function public.turno_cita_a_cola_prioritaria()   set search_path = public;
alter function public.turno_marcar_ausentes_grupo()     set search_path = public;
alter function public.turno_registrar_visita_cita()     set search_path = public;
alter function public.turno_registrar_visita_cola()     set search_path = public;

-- Helpers RLS: solo authenticated los necesita (las políticas los evalúan).
revoke execute on function public.turno_uid()                       from public, anon;
revoke execute on function public.turno_mis_negocios()              from public, anon;
revoke execute on function public.turno_negocios_admin()            from public, anon;
revoke execute on function public.turno_es_mi_perfil(uuid)          from public, anon;
revoke execute on function public.turno_perfil_en_mis_negocios(uuid) from public, anon;
revoke execute on function public.turno_usuarios_de_mis_negocios()  from public, anon;
revoke execute on function public.turno_registrar_usuario(text,text,text) from public, anon;

grant execute on function public.turno_uid()                       to authenticated;
grant execute on function public.turno_mis_negocios()              to authenticated;
grant execute on function public.turno_negocios_admin()            to authenticated;
grant execute on function public.turno_es_mi_perfil(uuid)          to authenticated;
grant execute on function public.turno_perfil_en_mis_negocios(uuid) to authenticated;
grant execute on function public.turno_usuarios_de_mis_negocios()  to authenticated;
grant execute on function public.turno_registrar_usuario(text,text,text) to authenticated;
