-- GESTIÓN DE LA FILA
--
-- Hasta ahora la fila solo se podía empujar hacia adelante: llamar al primero y
-- marcarlo atendido. En el piloto apareció lo obvio — la realidad de una
-- barbería no es una cola perfecta. Alguien se va, alguien llega con prisa y le
-- toca al de al lado, el barbero llama por error, el cliente pidió corte y
-- terminó pidiendo corte+barba.
--
-- Cinco operaciones, todas con la misma autorización: el turno es de mi silla,
-- o soy dueño/admin del local.
--
--   turno_mover_en_cola     subir o bajar un puesto
--   turno_llamar_a          llamar a alguien concreto, fuera de orden
--   turno_sacar_de_cola     sacarlo (se fue, no llegó, se equivocó)
--   turno_devolver_a_fila   deshacer un llamado
--   turno_cambiar_servicio  corregir el servicio del turno
--
-- El orden de la fila es la pareja (prioridad, posicion), no solo posicion: por
-- eso mover intercambia LAS DOS columnas con el vecino. Así el conjunto de
-- claves no cambia — no se abren huecos ni se duplican puestos.

-- Autorización común: devuelve la fila o revienta.
create or replace function turno_cola_operable(p_cola uuid)
returns turno_cola language plpgsql security definer set search_path to 'public' as $$
declare v public.turno_cola;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  select * into v from turno_cola where id = p_cola;
  if v.id is null then raise exception 'turno inexistente'; end if;
  if not (v.negocio_id in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;
  if v.perfil_id is not null and not public.turno_es_mi_perfil(v.perfil_id)
     and not (v.negocio_id in (select public.turno_negocios_admin())) then
    raise exception 'no puedes operar este turno';
  end if;
  return v;
end $$;

-- p_delta = -1 sube un puesto, +1 baja un puesto.
create or replace function turno_mover_en_cola(p_cola uuid, p_delta int)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v public.turno_cola; v_otro public.turno_cola;
begin
  v := public.turno_cola_operable(p_cola);
  if v.estado <> 'en_fila' then raise exception 'solo se pueden mover los turnos que están esperando'; end if;
  if p_delta not in (-1, 1) then raise exception 'movimiento invalido'; end if;

  perform pg_advisory_xact_lock(hashtext('turno_cola_' || v.negocio_id::text));

  -- El vecino inmediato en la misma fila: mismo local y misma silla (incluido
  -- "sin silla asignada", que es un valor propio y no comodín).
  if p_delta < 0 then
    select * into v_otro from turno_cola
     where negocio_id = v.negocio_id and estado = 'en_fila'
       and perfil_id is not distinct from v.perfil_id
       and (prioridad, posicion) < (v.prioridad, v.posicion)
     order by prioridad desc, posicion desc limit 1;
  else
    select * into v_otro from turno_cola
     where negocio_id = v.negocio_id and estado = 'en_fila'
       and perfil_id is not distinct from v.perfil_id
       and (prioridad, posicion) > (v.prioridad, v.posicion)
     order by prioridad asc, posicion asc limit 1;
  end if;
  if v_otro.id is null then return; end if;   -- ya está en la punta: no es error

  update turno_cola set prioridad = v_otro.prioridad, posicion = v_otro.posicion where id = v.id;
  update turno_cola set prioridad = v.prioridad,      posicion = v.posicion      where id = v_otro.id;
end $$;

-- Llamar a alguien concreto saltando el orden (llegó tarde y ya está, el de
-- adelante no aparece, etc.). Misma mecánica que turno_llamar_siguiente.
create or replace function turno_llamar_a(p_cola uuid)
returns turno_cola language plpgsql security definer set search_path to 'public' as $$
declare v public.turno_cola; v_ventana int; v_perfil uuid;
begin
  v := public.turno_cola_operable(p_cola);
  if v.estado <> 'en_fila' then raise exception 'ese turno ya no está esperando'; end if;

  -- Un cliente en curso a la vez por silla: si no, la pantalla del barbero
  -- muestra dos "llamados" y nadie sabe quién se sienta.
  if v.perfil_id is not null and exists(
       select 1 from turno_cola where perfil_id = v.perfil_id
        and estado in ('llamado','en_camino','atendiendo')) then
    raise exception 'ya tienes un cliente en curso: termínalo o devuélvelo a la fila';
  end if;

  select ventana_llegada_min into v_ventana from turno_configuracion_negocio where negocio_id = v.negocio_id;
  v_ventana := coalesce(v_ventana, 10);
  select id into v_perfil from turno_perfiles where usuario_id = public.turno_uid() and negocio_id = v.negocio_id limit 1;

  update turno_cola
     set estado = 'llamado', perfil_id = coalesce(perfil_id, v_perfil),
         llamado_at = now(), expira_at = now() + make_interval(mins => v_ventana)
   where id = p_cola returning * into v;
  return v;
end $$;

-- Sacarlo de la fila. 'abandonado' es el estado terminal que ya usaba el motor
-- para el que se va por su cuenta; aquí lo aplica el barbero.
create or replace function turno_sacar_de_cola(p_cola uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v public.turno_cola;
begin
  v := public.turno_cola_operable(p_cola);
  if v.estado not in ('en_fila','llamado','en_camino','atendiendo') then
    raise exception 'ese turno ya está cerrado';
  end if;
  update turno_cola set estado = 'abandonado' where id = p_cola;
end $$;

-- Deshacer un llamado: vuelve a esperar, conservando su puesto.
create or replace function turno_devolver_a_fila(p_cola uuid)
returns turno_cola language plpgsql security definer set search_path to 'public' as $$
declare v public.turno_cola;
begin
  v := public.turno_cola_operable(p_cola);
  if v.estado not in ('llamado','en_camino','atendiendo') then
    raise exception 'ese turno no está llamado';
  end if;
  update turno_cola
     set estado = 'en_fila', llamado_at = null, expira_at = null,
         en_camino_at = null, atendiendo_at = null
   where id = p_cola returning * into v;
  return v;
end $$;

-- Corregir el servicio (pidió corte y al final quiere corte+barba). Cambia
-- también el tipo, porque de él dependen la regla R1 y el cálculo del ETA.
create or replace function turno_cambiar_servicio(p_cola uuid, p_servicio uuid)
returns turno_cola language plpgsql security definer set search_path to 'public' as $$
declare v public.turno_cola; v_tipo text; v_neg uuid;
begin
  v := public.turno_cola_operable(p_cola);
  if v.estado not in ('en_fila','llamado','en_camino','atendiendo') then
    raise exception 'ese turno ya está cerrado';
  end if;

  select p.negocio_id, p.tipo_servicio into v_neg, v_tipo
    from turno_servicios s join turno_perfiles p on p.id = s.perfil_id
   where s.id = p_servicio;
  if v_neg is null then raise exception 'servicio inexistente'; end if;
  if v_neg <> v.negocio_id then raise exception 'ese servicio no es de este local'; end if;
  v_tipo := coalesce(v_tipo, 'barbero');

  if v_tipo <> v.tipo_servicio and exists(
       select 1 from turno_cola where cliente_id = v.cliente_id and tipo_servicio = v_tipo
         and estado in ('en_fila','llamado','en_camino','atendiendo') and id <> v.id) then
    raise exception 'ese cliente ya tiene un turno activo de ese tipo';
  end if;

  update turno_cola set servicio_id = p_servicio, tipo_servicio = v_tipo
   where id = p_cola returning * into v;
  return v;
end $$;

revoke all on function turno_cola_operable(uuid) from public;
grant execute on function turno_mover_en_cola(uuid, int)    to authenticated;
grant execute on function turno_llamar_a(uuid)              to authenticated;
grant execute on function turno_sacar_de_cola(uuid)         to authenticated;
grant execute on function turno_devolver_a_fila(uuid)       to authenticated;
grant execute on function turno_cambiar_servicio(uuid,uuid) to authenticated;
