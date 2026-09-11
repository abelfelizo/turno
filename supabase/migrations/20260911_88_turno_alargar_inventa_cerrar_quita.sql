-- ALARGAR INVENTA, CERRAR QUITA
--
-- La migración 87 dejó las tres funciones de la jornada detrás de
-- turno_perfil_operable, que es "mi silla o soy el dueño del local". Es la
-- puerta equivocada, y se ve al ponerla al lado de la regla que este repo ya
-- tenía escrita para los horarios (R11, política turno_horarios_write):
--
--   (es_mi_perfil AND autonomo) OR (perfil_admin AND NOT autonomo)
--
-- O sea: el horario del EMPLEADO lo pone la barbería; el del que ALQUILA su
-- asiento —y el del dueño— lo pone él. Con turno_perfil_operable se colaban dos
-- cosas que esa regla prohíbe:
--
--   · El dueño de un local de asientos alquilados podía moverle el cierre a un
--     barbero que le RENTA. Eso es cambiarle las horas a un negocio ajeno
--     dentro de su propio local.
--   · Y un empleado podía alargarse el día por su cuenta, saltándose que en su
--     local el horario lo decide la barbería.
--
-- PERO NO LAS DOS IGUAL, Y ESTA ES LA PARTE QUE IMPORTA. El repo ya distingue,
-- en la doctrina de los bloqueos:
--
--   «Los bloqueos son del barbero en todos los casos: solo QUITAN
--    disponibilidad, nunca la inventan.»
--
-- Esa frase resuelve esto sin inventar ninguna regla nueva:
--
--   · CERRAR ANTES quita disponibilidad. Es un bloqueo que dura lo que queda
--     del día. Si el barbero se va, se va: nadie puede obligarle a seguir
--     recibiendo gente por la app, y ningún local se rompe porque una silla
--     deje de aceptar clientes antes de la hora. Queda como estaba: la puede
--     usar quien opera la silla.
--
--   · ALARGAR inventa disponibilidad. Compromete a alguien a estar ahí, y por
--     tanto sigue la regla del horario: en un local de empleados lo decide la
--     barbería; el autónomo lo decide él.
--
--   · VOLVER A LA NORMA no puede pasarse de la norma por definición, así que
--     tampoco inventa nada. Queda abierta a quien opera la silla.
--
-- Y la tabla se cierra con la MISMA política que turno_horarios, para que la
-- regla no dependa de que se entre por la función: una regla que solo vale por
-- un camino no es una regla.

-- ── LA TABLA, CON LA POLÍTICA DEL HORARIO ────────────────────────────────────
drop policy if exists turno_jornadas_todo on turno_jornadas;

create policy turno_jornadas_select on turno_jornadas
  for select to authenticated
  using (public.turno_perfil_en_mis_negocios(perfil_id));

create policy turno_jornadas_write on turno_jornadas
  for all to authenticated
  using ((public.turno_es_mi_perfil(perfil_id) and public.turno_perfil_autonomo(perfil_id))
         or (public.turno_perfil_admin(perfil_id) and not public.turno_perfil_autonomo(perfil_id)))
  with check ((public.turno_es_mi_perfil(perfil_id) and public.turno_perfil_autonomo(perfil_id))
         or (public.turno_perfil_admin(perfil_id) and not public.turno_perfil_autonomo(perfil_id)));

-- ── ¿QUIÉN DECIDE LAS HORAS DE ESTA SILLA? ───────────────────────────────────
-- La misma condición que la política, en una función, para no escribirla tres
-- veces. Escrita dos veces se corrige una vez y la otra se queda mintiendo.
create or replace function turno_manda_en_el_horario(p_perfil uuid)
returns boolean
language sql stable security definer set search_path to 'public' as $$
  select (public.turno_es_mi_perfil(p_perfil) and public.turno_perfil_autonomo(p_perfil))
      or (public.turno_perfil_admin(p_perfil) and not public.turno_perfil_autonomo(p_perfil))
$$;

comment on function turno_manda_en_el_horario is
  'Quién decide las horas de esta silla, con la regla R11: el autónomo las '
  'suyas, y las del empleado su barbería. Igual que turno_horarios_write.';

grant execute on function turno_manda_en_el_horario(uuid) to authenticated;
revoke execute on function turno_manda_en_el_horario(uuid) from public, anon;

-- ── ALARGAR: INVENTA DISPONIBILIDAD, ASÍ QUE MANDA EL HORARIO ────────────────
create or replace function turno_alargar_jornada(p_perfil uuid, p_minutos int)
returns time
language plpgsql security definer set search_path to 'public' as $$
declare
  v_tz text; v_hoy date; v_ahora time; v_fin time; v_nuevo time;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  -- Alargar COMPROMETE a alguien a estar ahí. No es un ajuste operativo, es
  -- una decisión sobre el horario, y el horario tiene dueño según la modalidad.
  if not public.turno_manda_en_el_horario(p_perfil) then
    raise exception 'el horario de esa silla no lo decides tú';
  end if;
  if not public.turno_perfil_operable(p_perfil) then
    raise exception 'esa silla no está operativa';
  end if;
  if coalesce(p_minutos, 0) not between 15 and 240 then
    raise exception 'se alarga entre 15 minutos y 4 horas';
  end if;

  select coalesce(n.tz, 'America/Santo_Domingo') into v_tz
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id
   where p.id = p_perfil;
  if v_tz is null then raise exception 'ese barbero no existe'; end if;

  v_hoy   := (now() at time zone v_tz)::date;
  v_ahora := (now() at time zone v_tz)::time;
  select j.hora_fin into v_fin from turno_jornada_de(p_perfil, v_hoy) j;
  v_nuevo := least(time '23:59', greatest(coalesce(v_fin, v_ahora), v_ahora) + make_interval(mins => p_minutos));

  insert into turno_jornadas (perfil_id, fecha, hora_fin)
  values (p_perfil, v_hoy, v_nuevo)
  on conflict (perfil_id, fecha) do update set hora_fin = excluded.hora_fin;

  return v_nuevo;
end $$;

comment on function turno_alargar_jornada is
  'Alarga el cierre de HOY sin tocar el horario semanal. INVENTA '
  'disponibilidad, así que la decide quien manda en el horario de esa silla '
  '(R11). Ver migraciones 87 y 88.';

grant execute on function turno_alargar_jornada(uuid, int) to authenticated;

-- ── CERRAR ANTES: QUITA DISPONIBILIDAD, COMO UN BLOQUEO ──────────────────────
-- Se queda con turno_perfil_operable a propósito. Si el barbero se va, se va:
-- nadie puede obligarle a seguir recibiendo gente por la app, y que una silla
-- deje de aceptar clientes antes de tiempo no rompe nada de nadie.
create or replace function turno_cerrar_jornada(p_perfil uuid)
returns void
language plpgsql security definer set search_path to 'public' as $$
declare v_tz text; v_hoy date; v_ahora time; v_ini time;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not public.turno_perfil_operable(p_perfil) then
    raise exception 'esa silla no es tuya';
  end if;
  select coalesce(n.tz, 'America/Santo_Domingo') into v_tz
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id
   where p.id = p_perfil;
  if v_tz is null then raise exception 'ese barbero no existe'; end if;

  v_hoy   := (now() at time zone v_tz)::date;
  v_ahora := (now() at time zone v_tz)::time;
  select j.hora_inicio into v_ini from turno_jornada_de(p_perfil, v_hoy) j;

  insert into turno_jornadas (perfil_id, fecha, hora_fin)
  values (p_perfil, v_hoy, greatest(v_ahora, coalesce(v_ini, v_ahora)))
  on conflict (perfil_id, fecha) do update set hora_fin = excluded.hora_fin;
end $$;

comment on function turno_cerrar_jornada is
  'Cierra la fila de HOY a esta hora. QUITA disponibilidad, como un bloqueo, '
  'así que la puede usar quien opera la silla aunque el horario lo ponga la '
  'barbería. Ver migración 88.';

grant execute on function turno_cerrar_jornada(uuid) to authenticated;
