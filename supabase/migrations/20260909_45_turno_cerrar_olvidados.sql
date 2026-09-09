-- TURNOS QUE SE QUEDAN EN LA FILA PARA SIEMPRE
--
-- Reportado en el piloto: "no hay aviso o confirmación de si terminó un cliente
-- después de horas en turno".
--
-- El motor solo cerraba los turnos LLAMADOS que expiraban su ventana. Ningún
-- otro estado tenía final. Encontrado en la base al revisar esto: un cliente
-- llevaba 2 h 30 min en 'atendiendo' porque el barbero pulsó "Empezar" y nunca
-- "Terminar". Su pantalla decía "te están atendiendo" indefinidamente y, como
-- R1 solo permite un turno activo por tipo, tampoco podía pedir otro: quedaba
-- atrapado por un turno fantasma. Lo mismo pasaba con 'en_fila' cuando el
-- barbero cerraba el local o dejaba de usar la app.
--
-- CÓMO SE CIERRA CADA UNO, y por qué:
--
--   en_fila / llamado / en_camino → 'expirado'. Nunca se sentaron.
--   atendiendo                    → 'atendido'. El barbero pulsó Empezar, o
--                                   sea que el cliente SÍ se sentó y el corte
--                                   ocurrió. Registrar la visita y darle su
--                                   punto es el registro verdadero; quitárselo
--                                   por el olvido del barbero sería peor que
--                                   el riesgo de contar un cobro de más.
--
-- Se cierra por el final de la jornada del barbero, que es el motivo real
-- ("cerró la barbería"), con un tope duro de 8 horas para las sillas sin
-- horario configurado. El estado es 'expirado', que la app ya sabe enseñar
-- (R9: "tu turno expiró" + volver a entrar).
--
-- El aviso llega por realtime, no por push: este proyecto no tiene pg_net, así
-- que la base no puede llamar a nadie. La fila sí está publicada, de modo que
-- la pantalla del cliente cambia sola en cuanto la fila cambia de estado.

create or replace function turno_cerrar_olvidados()
returns int language plpgsql security definer set search_path to 'public' as $$
declare v_count int;
begin
  with viejos as (
    select q.id, q.estado
      from turno_cola q
      join turno_negocios n on n.id = q.negocio_id
      left join turno_horarios h
             on h.perfil_id = q.perfil_id
            and h.activo
            and h.dia_semana = extract(dow from (q.created_at at time zone coalesce(n.tz, 'America/Santo_Domingo')))
     where q.estado in ('en_fila','llamado','en_camino','atendiendo')
       and (
         -- Pasó el cierre de ese barbero ese día.
         (h.hora_fin is not null
          and (now() at time zone coalesce(n.tz, 'America/Santo_Domingo'))
              > ((q.created_at at time zone coalesce(n.tz, 'America/Santo_Domingo'))::date + h.hora_fin))
         -- O lleva demasiado abierto, haya horario o no.
         or q.created_at < now() - interval '8 hours'
       )
  )
  update turno_cola q
     set estado = case when v.estado = 'atendiendo' then 'atendido' else 'expirado' end,
         atendido_at = case when v.estado = 'atendiendo' then now() else q.atendido_at end
    from viejos v
   where q.id = v.id;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Se cuelga del barrido que ya corre cada minuto en vez de crear otro job:
-- un solo sitio donde mirar cuando algo no se cierre.
create or replace function turno_expirar_llamados()
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_count int;
begin
  update turno_cola set estado = 'expirado'
   where estado = 'llamado' and expira_at is not null and expira_at < now();
  get diagnostics v_count = row_count;

  update turno_citas c set estado = 'no_confirmada'
    from turno_configuracion_negocio cfg, turno_negocios n
   where cfg.negocio_id = c.negocio_id and n.id = c.negocio_id
     and c.estado = 'creada'
     and (c.fecha + c.hora_inicio) > (now() at time zone coalesce(n.tz, 'America/Santo_Domingo'))
     and ((c.fecha + c.hora_inicio) - (now() at time zone coalesce(n.tz, 'America/Santo_Domingo')))
         < make_interval(hours => cfg.anticipacion_minima_horas);

  v_count := v_count + public.turno_cerrar_olvidados();
  return v_count;
end $$;

grant execute on function turno_cerrar_olvidados() to authenticated;
