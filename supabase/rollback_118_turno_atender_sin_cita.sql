-- VUELTA ATRÁS DE LA MIGRACIÓN 118 (no es una migración: no se aplica sola).
--
-- Es la definición de turno_atender_sin_cita que estaba viva en producción
-- justo antes de aplicar la 118 (22 sep), copiada de pg_get_functiondef.
-- Regla vieja: con CUALQUIERA en la fila —en el local o en su casa— no se
-- sienta a nadie sin cita. Si hiciera falta volver a ella, se ejecuta esto y
-- en lib/silla.ts se pone REGLA_WALK_IN = 'nadie_esperando'.
CREATE OR REPLACE FUNCTION public.turno_atender_sin_cita(p_negocio uuid, p_perfil uuid, p_servicio uuid, p_nombre text DEFAULT NULL::text, p_telefono text DEFAULT NULL::text)
 RETURNS turno_cola
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cli uuid; v_pos int; v_dur int; v_tipo text; v_row public.turno_cola; v_esperando int;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not (p_negocio in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;
  if not public.turno_perfil_operable(p_perfil) then
    raise exception 'tu perfil todavía no está aprobado en este local';
  end if;
  if not public.turno_capta_por_su_cuenta(p_perfil) then
    raise exception 'aquí los clientes te los asigna la barbería. Si quieres poder sentar a alguien tú, pide que te activen «aceptar clientes por mi cuenta».';
  end if;

  select s.duracion_min, (select pf.tipo_servicio from turno_perfiles pf where pf.id = s.perfil_id)
    into v_dur, v_tipo
    from turno_servicios s where s.id = p_servicio and s.perfil_id = p_perfil;
  if v_dur is null then raise exception 'ese servicio no es tuyo'; end if;
  v_tipo := coalesce(v_tipo, 'barbero');

  perform pg_advisory_xact_lock(hashtext('turno_cola_' || p_negocio::text));

  select count(*) into v_esperando
    from turno_cola q
   where q.negocio_id = p_negocio
     and q.estado in ('en_fila', 'llamado', 'en_camino')
     and (q.perfil_id is null or q.perfil_id = p_perfil);
  if v_esperando > 0 then
    raise exception 'hay % esperando: llama al siguiente, o marca ausente a quien no llegó', v_esperando;
  end if;

  if exists (select 1 from turno_cola q
              where q.perfil_id = p_perfil and q.estado = 'atendiendo') then
    raise exception 'ya tienes a alguien en la silla';
  end if;

  insert into turno_usuarios(nombre, telefono, tipo_usuario)
  values (coalesce(nullif(trim(p_nombre), ''), 'Cliente sin cita'),
          coalesce(nullif(trim(p_telefono), ''), '-'), 'cliente')
  returning id into v_cli;
  insert into turno_membresias(usuario_id, negocio_id, rol, activo)
  values (v_cli, p_negocio, 'cliente', true);

  select coalesce(max(posicion) + 1, 1) into v_pos
    from turno_cola where negocio_id = p_negocio
     and estado in ('en_fila','llamado','en_camino','atendiendo');

  insert into turno_cola(negocio_id, perfil_id, cliente_id, servicio_id, tipo_cola, tipo_servicio,
                         prioridad, posicion, estado, llamado_at, atendiendo_at)
  values (p_negocio, p_perfil, v_cli, p_servicio, 'fisica', v_tipo,
          3, v_pos, 'atendiendo', now(), now())
  returning * into v_row;

  return v_row;
end $function$;
