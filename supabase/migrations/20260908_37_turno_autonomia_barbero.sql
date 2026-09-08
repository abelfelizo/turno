-- QUIÉN MANDA SOBRE SERVICIOS Y HORARIOS
--
-- Decisión de producto (sep-2026): el barbero es autónomo por defecto y decide
-- sus servicios, precios y horarios. La excepción es el EMPLEADO: ahí manda la
-- barbería.
--
-- Hasta ahora las políticas decían solo `turno_es_mi_perfil(perfil_id)`, lo que
-- estaba mal en las dos direcciones:
--
--   · el empleado podía cambiarse sus propios precios y su horario;
--   · el dueño NO podía tocar los de su empleado — ni siquiera existía forma de
--     aplicar la regla desde la app, porque RLS lo bloqueaba.
--
-- Los BLOQUEOS son otra cosa y no se restringen: marcar el almuerzo o un rato
-- fuera es operativo, no una decisión de negocio, y solo quita disponibilidad
-- (nunca la inventa). El dueño los ve y puede quitarlos.

-- ¿El dueño de este perfil decide por sí mismo? Sí para barbero_renta y para el
-- dueño que atiende; no para el empleado.
create or replace function turno_perfil_autonomo(p uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists(
    select 1
      from public.turno_perfiles pr
      join public.turno_membresias m
        on m.usuario_id = pr.usuario_id
       and m.negocio_id = pr.negocio_id
       and m.activo
     where pr.id = p
       and m.rol in ('barbero_renta', 'dueno')
  )
$$;

-- ¿Soy dueño del local al que pertenece este perfil?
create or replace function turno_perfil_admin(p uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists(
    select 1 from public.turno_perfiles pr
     where pr.id = p
       and pr.negocio_id in (select public.turno_negocios_admin())
  )
$$;

drop policy if exists turno_servicios_write on turno_servicios;
create policy turno_servicios_write on turno_servicios for all
  using      ((turno_es_mi_perfil(perfil_id) and turno_perfil_autonomo(perfil_id)) or turno_perfil_admin(perfil_id))
  with check ((turno_es_mi_perfil(perfil_id) and turno_perfil_autonomo(perfil_id)) or turno_perfil_admin(perfil_id));

drop policy if exists turno_horarios_write on turno_horarios;
create policy turno_horarios_write on turno_horarios for all
  using      ((turno_es_mi_perfil(perfil_id) and turno_perfil_autonomo(perfil_id)) or turno_perfil_admin(perfil_id))
  with check ((turno_es_mi_perfil(perfil_id) and turno_perfil_autonomo(perfil_id)) or turno_perfil_admin(perfil_id));

-- El dueño también puede bloquear y liberar horas de su equipo (imprevistos,
-- cierre por un día). El barbero conserva las suyas.
drop policy if exists turno_bloqueos_write on turno_bloqueos;
create policy turno_bloqueos_write on turno_bloqueos for all
  using      (turno_es_mi_perfil(perfil_id) or turno_perfil_admin(perfil_id))
  with check (turno_es_mi_perfil(perfil_id) or turno_perfil_admin(perfil_id));

grant execute on function turno_perfil_autonomo(uuid) to authenticated;
grant execute on function turno_perfil_admin(uuid)    to authenticated;
