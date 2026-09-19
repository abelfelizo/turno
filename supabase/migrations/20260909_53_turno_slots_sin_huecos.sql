-- LOS HORARIOS DEJABAN TIEMPO MUERTO ENTRE SERVICIOS DE DISTINTA DURACIÓN
--
-- Reportado en el piloto: "los servicios no duran lo mismo, una barba 30 y un
-- corte 45; ¿cómo calcula el sistema los horarios y garantiza que no se creen
-- tramos muertos?". No lo garantizaba. Reproducido contra la base:
--
--   DÍA VACÍO (8:00–12:00, gap 10)
--     Corte 45min -> 08:00  08:55  09:50  10:45
--     Barba 30min -> 08:00  08:40  09:20  10:00  10:40  11:20
--
--   YA HAY UN CORTE RESERVADO 08:00–08:45
--     Barba 30min -> 09:20  10:00  10:40  11:20
--
-- La barba cabía a las 08:55 —justo al terminar el corte más el gap— y el
-- sistema la mandaba a las 09:20. **35 minutos muertos**, y el cliente que
-- quería las nueve se va a otro sitio.
--
-- POR QUÉ PASABA. Los huecos se generaban sobre una rejilla fija que arranca en
-- la hora de apertura y avanza de (duración + gap) en (duración + gap). Esa
-- rejilla depende del servicio que estás reservando, así que la barba solo podía
-- caer en 08:00, 08:40, 09:20… Como 08:40 pisa el corte, se descartaba y el
-- siguiente escalón ya era 09:20. El hueco entre 08:45 y 09:20 no existía para
-- la rejilla porque no caía en ningún escalón.
--
-- Una rejilla fija solo funciona si todos los servicios duran lo mismo. En
-- cuanto duran distinto —que es el caso normal de una barbería— deja aire.
--
-- EL ARREGLO. Los candidatos ya no salen solo de la rejilla: se añaden los
-- instantes PEGADOS a lo que ya hay, o sea el final de cada cita y de cada
-- bloqueo más el tiempo entre clientes. Así el día se compacta solo: cada
-- reserva nueva se ofrece lo antes posible después de la anterior, y el hueco
-- muerto desaparece.
--
-- Se conserva la rejilla además de los pegados: en un día vacío es lo que da
-- horas redondas y predecibles (08:00, 08:55…) en vez de una lista arbitraria.
-- Los pegados solo añaden las oportunidades que la rejilla no ve.
--
-- OJO con la medianoche: las sumas se hacen sobre timestamp (fecha + hora) y no
-- sobre `time`, porque en `time` un 23:50 + 30min da 00:20 y una comprobación
-- de "cabe antes de cerrar" pasaría al revés.

create or replace function turno_slots_disponibles(p_perfil uuid, p_fecha date, p_servicio uuid)
returns setof time
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_dow int := extract(dow from p_fecha);
  v_ini time; v_fin time; v_gap int; v_dur int;
  v_neg uuid; v_tz text; v_ahora timestamp; v_ant int; v_desde timestamp;
  v_paso interval; v_abre timestamp; v_cierra timestamp;
begin
  select duracion_min into v_dur from turno_servicios where id = p_servicio;
  if v_dur is null or v_dur <= 0 then return; end if;

  select p.negocio_id, coalesce(n.tz, 'America/Santo_Domingo') into v_neg, v_tz
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id where p.id = p_perfil;
  if v_neg is null then return; end if;

  select hora_inicio, hora_fin, coalesce(tiempo_entre_clientes, 10)
    into v_ini, v_fin, v_gap
    from turno_horarios where perfil_id = p_perfil and dia_semana = v_dow and activo
    order by hora_inicio limit 1;
  if v_ini is null then return; end if;

  v_ahora  := (now() at time zone v_tz);
  v_ant    := public.turno_regla_tiempo(p_perfil, v_neg, 'anticipacion_minima_horas');
  v_desde  := v_ahora + make_interval(hours => v_ant);
  v_paso   := make_interval(mins => v_dur + v_gap);
  v_abre   := p_fecha + v_ini;
  v_cierra := p_fecha + v_fin;

  return query
  with rejilla as (
    -- Horas redondas desde la apertura: lo que hace predecible un día vacío.
    select v_abre + (n * v_paso) as t
      from generate_series(
        0,
        greatest(0, floor(extract(epoch from (v_cierra - v_abre))
                          / nullif(extract(epoch from v_paso), 0))::int)
      ) n
  ),
  pegados as (
    -- Justo al terminar lo que ya hay. Sin esto queda aire entre servicios de
    -- distinta duración, que es el fallo que arregla esta migración.
    select (p_fecha + c.hora_fin) + make_interval(mins => v_gap) as t
      from turno_citas c
     where c.perfil_id = p_perfil and c.fecha = p_fecha
       and c.estado in ('creada','confirmada','en_camino')
    union all
    select (p_fecha + b.hora_fin) + make_interval(mins => v_gap) as t
      from turno_bloqueos b
     where b.perfil_id = p_perfil and b.fecha = p_fecha
  ),
  candidatos as (
    select t from rejilla
    union
    select t from pegados
  )
  select c.t::time
    from candidatos c
   where c.t >= v_abre
     and c.t + make_interval(mins => v_dur) <= v_cierra
     and c.t >= v_desde
     and not exists (
       select 1 from turno_citas x
        where x.perfil_id = p_perfil and x.fecha = p_fecha
          and x.estado in ('creada','confirmada','en_camino')
          and (p_fecha + x.hora_inicio) < c.t + make_interval(mins => v_dur)
          and (p_fecha + x.hora_fin)    > c.t)
     and not exists (
       select 1 from turno_bloqueos b
        where b.perfil_id = p_perfil and b.fecha = p_fecha
          and (p_fecha + b.hora_inicio) < c.t + make_interval(mins => v_dur)
          and (p_fecha + b.hora_fin)    > c.t)
   order by c.t;
end $$;

grant execute on function turno_slots_disponibles(uuid, date, uuid) to authenticated;
