-- CITAS QUE NUNCA SE CIERRAN
--
-- Encontrado en la revisión: tres citas en estado 'confirmada' con fecha de
-- junio y julio, sin tocar desde entonces. Nadie las marcó atendida ni no_llego
-- y el motor no tenía barrido para ellas, así que se quedan "confirmadas" para
-- siempre.
--
-- Es el mismo fallo que los turnos olvidados de la migración 45, en la otra
-- mitad del sistema: los estados que abre una persona tienen que poder cerrarse
-- sin esa persona, o la base acumula filas que mienten.
--
-- No se ve mucho porque getMisCitas filtra por fecha >= hoy, pero ensucia
-- cualquier cuenta por estado y el barbero que navega a un día pasado ve
-- "confirmada" en una cita de hace tres meses.
--
-- Se cierra como 'atendida' si hay una visita registrada de ese cliente con ese
-- barbero ese día —ocurrió, solo faltó pulsar el botón—, y como 'no_llego' en
-- cualquier otro caso. Se espera un día completo antes de tocar nada, para no
-- pisar a un barbero que cierra su jornada tarde.

create or replace function turno_cerrar_citas_viejas()
returns int language plpgsql security definer set search_path to 'public' as $$
declare v_count int;
begin
  update turno_citas c
     set estado = case
           when exists (
             select 1 from turno_historial_visitas hv
              where hv.cliente_id = c.cliente_id
                and hv.perfil_id = c.perfil_id
                and hv.fecha = c.fecha)
           then 'atendida' else 'no_llego' end,
         atendida_at = case
           when exists (
             select 1 from turno_historial_visitas hv
              where hv.cliente_id = c.cliente_id
                and hv.perfil_id = c.perfil_id
                and hv.fecha = c.fecha)
           then now() else c.atendida_at end
    from turno_negocios n
   where n.id = c.negocio_id
     and c.estado in ('creada', 'confirmada', 'no_confirmada', 'en_camino')
     and (c.fecha + c.hora_fin)
         < (now() at time zone coalesce(n.tz, 'America/Santo_Domingo')) - interval '1 day';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Colgado del mismo barrido de cada minuto: un solo sitio donde mirar.
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
  v_count := v_count + public.turno_cerrar_citas_viejas();
  return v_count;
end $$;

grant execute on function turno_cerrar_citas_viejas() to authenticated;
