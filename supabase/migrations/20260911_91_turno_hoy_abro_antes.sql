-- HOY ABRO ANTES
--
-- La migración 87 dio "hoy cierro más tarde" y se le olvidó la otra mitad del
-- día. Reportado desde el teléfono:
--
--   «si abro a las 8am y quiero abrir a las 6am ese día no debería decir seguir
--    abierto porque no sería una extensión de horario sino un adelanto»
--
-- Y tiene razón en las dos cosas a la vez, que es lo interesante:
--
--   · EL BOTÓN MENTÍA. turno_fila_abierta cierra la fila por las DOS puntas: si
--     aún no has abierto y si ya cerraste. La app trataba las dos igual —una
--     sola frase, "tu fila digital ya cerró por horario", y un solo botón,
--     "seguir abierto un rato"— cuando a las 6 de la mañana no has cerrado
--     nada: todavía no has abierto.
--
--   · Y NO HABÍA CÓMO. turno_alargar_jornada solo mueve `hora_fin`. A las 6am,
--     alargar el cierre de la tarde no deja entrar a nadie AHORA. La única
--     manera de abrir antes era cambiarse el horario semanal —y dejárselo
--     cambiado para todos los martes— que es exactamente lo que la 87 existía
--     para no tener que hacer.
--
-- ── DE QUIÉN ES ESTA DECISIÓN ───────────────────────────────────────────────
-- La 88 dejó escrita la regla que resuelve esto sin inventar nada:
--
--   · CERRAR ANTES quita disponibilidad → es un bloqueo → lo decide quien opera
--     la silla.
--   · ALARGAR inventa disponibilidad → lo decide quien manda en el horario (R11).
--
-- Adelantar la apertura INVENTA disponibilidad igual que alargar: compromete a
-- alguien a estar ahí a una hora a la que no había dicho que estaría. Así que va
-- con turno_manda_en_el_horario, la misma puerta que alargar. En un local de
-- empleados lo decide la barbería; el autónomo lo decide él.
--
-- ── LOS LÍMITES ─────────────────────────────────────────────────────────────
-- Entre 15 minutos y 4 horas, como alargar, y con suelo en 00:00. Y se exige
-- que HAYA jornada hoy: adelantar la apertura de un día que no trabajas no es
-- abrir antes, es abrir — y para eso está el horario semanal. Si el barbero
-- quiere trabajar un domingo que tiene libre, eso es un cambio de horario, no
-- un ajuste de hoy, y debe verlo como tal.
--
-- Solo se toca `hora_inicio`: `hora_fin` se queda como estaba (la del horario
-- semanal, o la que dejó un alargar anterior). Las dos puntas del día son
-- independientes y turno_jornada_de ya las coalesce por separado.

create or replace function turno_adelantar_jornada(p_perfil uuid, p_minutos int)
returns time
language plpgsql security definer set search_path to 'public' as $$
declare
  v_tz text; v_hoy date; v_ini time; v_fin time; v_nuevo time;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  -- Adelantar COMPROMETE a estar ahí antes de la hora anunciada. Como alargar,
  -- es una decisión sobre el horario, y el horario tiene dueño según la
  -- modalidad. Ver migración 88.
  if not public.turno_manda_en_el_horario(p_perfil) then
    raise exception 'el horario de esa silla no lo decides tú';
  end if;
  if not public.turno_perfil_operable(p_perfil) then
    raise exception 'esa silla no está operativa';
  end if;
  if coalesce(p_minutos, 0) not between 15 and 240 then
    raise exception 'se adelanta entre 15 minutos y 4 horas';
  end if;

  select coalesce(n.tz, 'America/Santo_Domingo') into v_tz
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id
   where p.id = p_perfil;
  if v_tz is null then raise exception 'ese barbero no existe'; end if;

  v_hoy := (now() at time zone v_tz)::date;
  select j.hora_inicio, j.hora_fin into v_ini, v_fin from turno_jornada_de(p_perfil, v_hoy) j;
  -- Sin jornada hoy no hay nada que adelantar: abrir un día libre es cambiar el
  -- horario, no ajustar el de hoy, y se decide en otro sitio y a conciencia.
  if v_ini is null then raise exception 'hoy no tienes jornada: eso se cambia en tu horario'; end if;

  v_nuevo := greatest(time '00:00', v_ini - make_interval(mins => p_minutos));

  insert into turno_jornadas (perfil_id, fecha, hora_inicio)
  values (p_perfil, v_hoy, v_nuevo)
  on conflict (perfil_id, fecha) do update set hora_inicio = excluded.hora_inicio;

  return v_nuevo;
end $$;

comment on function turno_adelantar_jornada is
  'Adelanta la APERTURA de hoy sin tocar el horario semanal. Inventa '
  'disponibilidad igual que alargar, así que la decide quien manda en el '
  'horario de esa silla (R11). No toca hora_fin. Ver migraciones 87, 88 y 91.';

grant execute on function turno_adelantar_jornada(uuid, int) to authenticated;
revoke execute on function turno_adelantar_jornada(uuid, int) from public, anon;
