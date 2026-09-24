-- LA AGENDA TAMBIÉN PASA DE LA MEDIANOCHE
--
-- Segunda mitad de la 113. Aquélla arregló la FILA; la agenda de citas seguía
-- sin enterarse de que una jornada puede cruzar la medianoche.
--
-- `turno_slots_disponibles` calculaba así el cierre del día:
--
--     v_cierra := p_fecha + v_fin;
--
-- Con un horario de 21:00 a 03:00 eso deja el cierre a las tres de la mañana
-- DEL MISMO DÍA, o sea dieciocho horas ANTES de la apertura. La rejilla de
-- huecos salía vacía y el barbero de Navidad no podía recibir ni una cita:
-- no es que se ofrecieran pocas horas, es que se ofrecían cero.
--
-- ── POR QUÉ NO BASTA CON ARREGLAR ESA LÍNEA ─────────────────────────────────
-- Poner el cierre en su sitio —la madrugada siguiente— hace que la función
-- devuelva huecos como «00:30». Pero devuelve HORAS SUELTAS, y quien las
-- recibe reserva con la fecha que preguntó. El cliente vería 00:30 al mirar el
-- 24 y al tocarlo se guardaría una cita el 24 a las 00:30 — doce horas en el
-- pasado, que `turno_agendar_cita` rechaza por falta de antelación. Huecos que
-- se ofrecen y no se pueden reservar: peor que no ofrecer ninguno.
--
-- ── LA REGLA ────────────────────────────────────────────────────────────────
-- **Cada día ofrece los huecos que de verdad caen en ese día.** Se miran DOS
-- jornadas: la que empieza ese día y la que empezó el día anterior y todavía
-- corre. De las dos se recorta lo que cae dentro del día pedido.
--
-- Así, una barbería abierta del 24 a las 9 de la noche al 25 a las 3 de la
-- mañana ofrece 21:00–23:30 cuando preguntas por el 24, y 00:00–02:30 cuando
-- preguntas por el 25. La firma no cambia, cada hora devuelta pertenece de
-- verdad a la fecha preguntada, y la cita se guarda en su día natural — que es
-- donde el barbero la va a buscar a la una de la mañana, porque a esa hora su
-- pantalla ya está en el día 25.
--
-- ── LO QUE SE DEJA FUERA A PROPÓSITO ────────────────────────────────────────
-- Una cita NO puede montarse encima de la medianoche. `turno_citas` guarda
-- `hora_inicio` y `hora_fin` como horas sueltas de un día, y una que empezara
-- a las 23:45 y acabara a las 00:15 dejaría `hora_fin < hora_inicio`: todas
-- las comprobaciones de solape del sistema —que comparan rangos dentro de un
-- mismo día— dejarían de funcionar para ella, y en silencio.
--
-- Así que se descarta el hueco que quedaría a caballo. Se pierde uno, justo en
-- el cambio de día. Arreglarlo de verdad es cambiar cómo se guarda una cita, y
-- eso no se hace de pasada dentro de otra cosa.

create or replace function public.turno_slots_disponibles(p_perfil uuid, p_fecha date, p_servicio uuid)
returns setof time
language plpgsql stable security definer set search_path = public as $$
declare
  v_dur int; v_neg uuid; v_tz text; v_ahora timestamp; v_ant int; v_desde timestamp;
  v_carga int;
  v_dia_ini timestamp := p_fecha::timestamp;
  v_dia_fin timestamp := (p_fecha + 1)::timestamp;
begin
  if not public.turno_perfil_acepta(p_perfil, p_fecha) then return; end if;
  select duracion_min into v_dur from turno_servicios where id = p_servicio;
  if v_dur is null or v_dur <= 0 then return; end if;
  select p.negocio_id, coalesce(n.tz, 'America/Santo_Domingo') into v_neg, v_tz
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id where p.id = p_perfil;
  if v_neg is null then return; end if;

  v_ahora  := (now() at time zone v_tz);
  v_ant    := public.turno_regla_tiempo(p_perfil, v_neg, 'anticipacion_minima_horas');
  v_desde  := v_ahora + make_interval(hours => v_ant);
  if p_fecha = v_ahora::date then
    v_carga := coalesce(public.turno_carga_de_fila(p_perfil), 0);
    if v_carga > 0 then
      v_desde := greatest(v_desde, v_ahora + make_interval(mins => v_carga));
    end if;
  end if;

  return query
  with ventanas as (
    -- La jornada que empieza HOY y la que empezó AYER y todavía corre. Se
    -- quedan sólo las que tocan el día pedido. Para un horario normal la de
    -- ayer no toca nada y esto se comporta exactamente como antes.
    select v.inicio, v.fin, coalesce(v.gap, 0) as gap
      from (select p_fecha as dia union all select p_fecha - 1) d
      cross join lateral public.turno_ventana_cruda(p_perfil, d.dia) v
     where v.fin > v_dia_ini and v.inicio < v_dia_fin
  ),
  rejilla as (
    -- La rejilla arranca en la apertura de SU jornada, no a medianoche: los
    -- huecos siguen cayendo donde el barbero los tiene, aunque el día cambie
    -- por el medio.
    select w.inicio + (n * make_interval(mins => v_dur + w.gap)) as t
      from ventanas w
      cross join lateral generate_series(
        0,
        greatest(0, floor(extract(epoch from (w.fin - w.inicio))
                          / nullif(extract(epoch from make_interval(mins => v_dur + w.gap)), 0))::int)
      ) n
  ),
  pegados as (
    -- Pegar el siguiente hueco justo detrás de lo que ya hay, para no dejar
    -- huecos muertos. Sale uno por ventana; el filtro de abajo tira el que no
    -- quepa en ninguna.
    select (p_fecha + c.hora_fin) + make_interval(mins => w.gap) as t
      from turno_citas c cross join ventanas w
     where c.perfil_id = p_perfil and c.fecha = p_fecha
       and c.estado in ('creada','confirmada','en_camino')
    union all
    select (p_fecha + b.hora_fin) + make_interval(mins => w.gap) as t
      from turno_bloqueos b cross join ventanas w
     where b.perfil_id = p_perfil and b.fecha = p_fecha
  ),
  candidatos as (
    select t from rejilla
    union
    select t from pegados
  )
  select c.t::time
    from candidatos c
   where c.t >= v_dia_ini
     -- Y que el servicio ENTERO quepa dentro del día: una cita a caballo de la
     -- medianoche quedaría con la hora de fin por delante de la de inicio y
     -- rompería en silencio todas las comprobaciones de solape.
     and c.t + make_interval(mins => v_dur) < v_dia_fin
     -- Que quepa dentro de alguna de las jornadas que tocan este día.
     and exists (select 1 from ventanas w
                  where c.t >= w.inicio
                    and c.t + make_interval(mins => v_dur) <= w.fin)
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

revoke execute on function public.turno_slots_disponibles(uuid, date, uuid) from public, anon;
grant  execute on function public.turno_slots_disponibles(uuid, date, uuid) to authenticated;
