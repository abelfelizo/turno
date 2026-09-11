-- LAS DOS HORAS EXTRA QUE EL CRON NO VEÍA
--
-- Reportado desde el teléfono: «los clientes se están cancelando aún cuando se
-- marcó 2 horas extra de trabajo. No funcionó.»
--
-- No funcionó, y la causa es exactamente la forma de fallo que este repo ya
-- conoce: DOS SITIOS LEYENDO LA MISMA REGLA POR PUERTAS DISTINTAS.
--
-- La migración 87 dio "hoy cierro más tarde" y lo escribió en `turno_jornadas`,
-- una tabla aparte, deliberadamente SIN tocar `turno_horarios` — hay un caso
-- permanente que lo fija («alargar · NO toca el horario semanal»), porque la
-- excepción de una noche no puede volverse la norma.
--
-- Quien pregunta por `turno_jornada_de` se entera: turno_fila_abierta,
-- turno_slots_disponibles, el panel del barbero. Pero turno_cerrar_olvidados
-- —que corre en el cron CADA MINUTO— hacía su propio join contra
-- `turno_horarios` por `dia_semana` y no sabía que la tabla de excepciones
-- existe. Así que:
--
--   · el barbero alarga dos horas,
--   · el letrero dice "abierto" y la puerta deja entrar,
--   · y el cron, por detrás, va expirando a todo el que espera en cuanto pasa
--     la hora de cierre del horario SEMANAL.
--
-- El cliente ve su turno cancelado sin que nadie lo cancele, y el barbero ve
-- vaciarse una fila que la app le acaba de decir que está abierta.
--
-- ── POR QUÉ NO SE LLAMA A turno_jornada_de ──────────────────────────────────
-- Sería lo natural, y es una trampa. `turno_jornada_de` empieza con
--
--   if public.turno_uid() is null then raise exception 'no autenticado'; end if;
--
-- y EL CRON CORRE SIN SESIÓN. Llamarla desde aquí tumbaría el mantenimiento
-- nocturno entero, que es palabra por palabra lo que ya pasó en la migración 73
-- y costó dos migraciones arreglar. Está anotado en HANDOFF.md como uno de los
-- cuatro fallos que más enseñaron, y no se va a repetir por comodidad.
--
-- Así que la excepción se resuelve AQUÍ, con un left join a `turno_jornadas`, y
-- el cierre efectivo es `coalesce(j.hora_fin, h.hora_fin)`. Es la misma regla
-- que aplica turno_jornada_de: la jornada del día manda sobre la de la semana.
--
-- ── Y EL TOPE DE OCHO HORAS DEJA DE PISAR LA JORNADA ────────────────────────
-- El `or q.created_at < now() - interval '8 hours'` era un tope absoluto que
-- corría EN PARALELO al horario. Con él, una jornada larga —o larga por la
-- extensión— seguía expirando gente a las ocho horas aunque el local estuviera
-- abierto. Ese tope existe para los turnos de los que no sabemos cuándo
-- terminan, no para contradecir un cierre que sí conocemos. Ahora es lo que
-- siempre debió ser: **un respaldo, no un competidor**.
--
--   · Si sabemos a qué hora cierra esa silla ese día → eso decide, y nada más.
--   · Si no lo sabemos (sin horario y sin jornada, o un turno sin barbero
--     asignado) → el respaldo de ocho horas, para que nada se quede colgado
--     para siempre.

create or replace function turno_cerrar_olvidados()
returns integer
language plpgsql security definer set search_path to 'public' as $$
declare v_count int;
begin
  with viejos as (
    select q.id, q.estado
      from turno_cola q
      join turno_negocios n on n.id = q.negocio_id
      -- El día LOCAL del turno: el mismo con el que se busca su jornada.
      cross join lateral (
        select (q.created_at at time zone coalesce(n.tz, 'America/Santo_Domingo'))::date as dia
      ) d
      left join turno_horarios h
             on h.perfil_id = q.perfil_id
            and h.activo
            and h.dia_semana = extract(dow from d.dia)
      -- LA EXCEPCIÓN DEL DÍA (migración 87), que es lo que faltaba.
      left join turno_jornadas j
             on j.perfil_id = q.perfil_id
            and j.fecha = d.dia
     where q.estado in ('en_fila','llamado','en_camino','atendiendo')
       and case
             -- Sabemos cuándo cierra: eso manda, alargado o adelantado.
             when coalesce(j.hora_fin, h.hora_fin) is not null
               then (now() at time zone coalesce(n.tz, 'America/Santo_Domingo'))
                    > (d.dia + coalesce(j.hora_fin, h.hora_fin))
             -- No lo sabemos: respaldo, para que nada quede colgado.
             else q.created_at < now() - interval '8 hours'
           end
  )
  update turno_cola q
     set estado = case when v.estado = 'atendiendo' then 'atendido' else 'expirado' end,
         atendido_at = case when v.estado = 'atendiendo' then now() else q.atendido_at end
    from viejos v
   where q.id = v.id;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

comment on function turno_cerrar_olvidados is
  'Cierra los turnos que se quedaron vivos pasada la jornada. Respeta la '
  'excepción del día (turno_jornadas): alargar o adelantar mueve también esta '
  'hora. No llama a turno_jornada_de a propósito — el cron corre sin sesión y '
  'esa función exige una. Ver migración 100.';
