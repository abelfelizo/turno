-- MI BARBERO
--
-- Pedido desde el teléfono: que el cliente pueda marcar un barbero como el suyo
-- de confianza, y que el sistema intente asignárselo automáticamente cuando
-- esté disponible.
--
-- Es la relación que sostiene una barbería. Nadie dice "voy a cortarme", dice
-- "voy donde Abel", y hasta ahora la app no sabía nada de eso: cada vez que el
-- cliente pedía turno tenía que volver a buscar a su barbero en una lista, y si
-- tocaba "cualquiera disponible" por prisa, le tocaba un desconocido. El dato
-- estaba en su historial —doce visitas seguidas con la misma persona— y no se
-- usaba para nada.
--
-- DÓNDE VIVE. En la membresía, que es exactamente la fila que dice "este
-- usuario es cliente de este local": el barbero de confianza es de un local,
-- porque el mismo cliente puede ir a dos sitios distintos. Una tabla nueva
-- habría dicho lo mismo con una llave más.
--
-- QUÉ CAMBIA AL PEDIR TURNO. Solo el caso "cualquiera disponible". Si el
-- cliente eligió barbero, manda su elección y esto no se mira: elegir a otro no
-- puede ser más difícil que no tener preferido. Y si el preferido no puede
-- ahora —cerrado, en descanso, suspendido— la fila sigue funcionando como
-- siempre, sin barbero asignado. "Intentar" es la palabra correcta: se intenta y
-- si no se puede, no pasa nada.
--
-- LO QUE NO HACE: no le da prioridad ninguna. Ser cliente fijo de alguien no te
-- adelanta en la fila; solo decide QUIÉN te atiende, no CUÁNDO.

alter table turno_membresias
  add column if not exists perfil_preferido uuid references turno_perfiles(id) on delete set null;

comment on column turno_membresias.perfil_preferido is
  'El barbero de confianza del cliente EN ESTE LOCAL. Se usa para preseleccionar '
  'y para resolver "cualquiera disponible" cuando él puede atender. Nunca da '
  'prioridad en la fila.';

create or replace function turno_marcar_preferido(p_negocio uuid, p_perfil uuid default null)
returns void
language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := public.turno_uid();
begin
  if v_uid is null then raise exception 'no autenticado'; end if;
  if not (p_negocio in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;
  -- Que el barbero sea de ESE local: si no, el cliente podría apuntarse como
  -- preferido a alguien de otra barbería y dejar su membresía apuntando fuera.
  if p_perfil is not null and not exists (
       select 1 from turno_perfiles p
        where p.id = p_perfil and p.negocio_id = p_negocio and p.activo and p.aprobado) then
    raise exception 'ese barbero no trabaja en este local';
  end if;

  update turno_membresias
     set perfil_preferido = p_perfil
   where usuario_id = v_uid and negocio_id = p_negocio and rol = 'cliente' and activo;
end $$;

comment on function turno_marcar_preferido is
  'El cliente marca (o quita, con null) su barbero de confianza en un local.';

grant execute on function turno_marcar_preferido(uuid, uuid) to authenticated;

create or replace function turno_mi_preferido(p_negocio uuid)
returns uuid
language sql stable security definer set search_path to 'public' as $$
  select m.perfil_preferido
    from turno_membresias m
   where m.usuario_id = public.turno_uid()
     and m.negocio_id = p_negocio and m.rol = 'cliente' and m.activo
   limit 1
$$;

grant execute on function turno_mi_preferido(uuid) to authenticated;

-- ── LA FILA INTENTA PONERTE CON EL TUYO ──────────────────────────────────────
create or replace function turno_entrar_a_cola(
  p_negocio uuid, p_servicio uuid, p_tipo_cola text default 'digital', p_perfil uuid default null)
returns turno_cola
language plpgsql security definer set search_path to 'public' as $$
declare
  v_cliente uuid := public.turno_uid();
  v_pos int; v_prioridad int; v_limite int; v_en_fila int;
  v_tipo text; v_doble boolean; v_row public.turno_cola; v_espera int;
  v_motivo text; v_pref uuid;
begin
  if v_cliente is null then raise exception 'no autenticado'; end if;
  if p_tipo_cola not in ('digital','fisica') then raise exception 'tipo_cola invalido'; end if;
  if not (p_negocio in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;

  -- "CUALQUIERA DISPONIBLE" CON BARBERO DE CONFIANZA: se intenta el suyo. Si no
  -- puede atender ahora, se sigue sin barbero asignado, que es lo que el cliente
  -- pidió. Va ANTES de comprobar la puerta para que la comprobación sea la del
  -- barbero que de verdad le va a tocar.
  if p_perfil is null then
    v_pref := public.turno_mi_preferido(p_negocio);
    if v_pref is not null and public.turno_fila_abierta(v_pref, p_negocio) is null then
      p_perfil := v_pref;
    end if;
  end if;

  v_motivo := public.turno_fila_abierta(p_perfil, p_negocio);
  if v_motivo is not null then raise exception '%', v_motivo; end if;

  select p.tipo_servicio into v_tipo
    from turno_servicios s join turno_perfiles p on p.id = s.perfil_id
   where s.id = p_servicio;
  v_tipo := coalesce(v_tipo, 'barbero');

  select coalesce(doble_servicio_activo, true) into v_doble
    from turno_configuracion_negocio where negocio_id = p_negocio;
  v_doble := coalesce(v_doble, true);

  if v_doble then
    if exists(select 1 from turno_cola
              where cliente_id = v_cliente and tipo_servicio = v_tipo
                and estado in ('en_fila','llamado','en_camino','atendiendo')) then
      raise exception 'ya tienes un turno activo de este tipo de servicio';
    end if;
  else
    if exists(select 1 from turno_cola
              where cliente_id = v_cliente
                and estado in ('en_fila','llamado','en_camino','atendiendo')) then
      raise exception 'ya tienes un turno activo';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('turno_cola_' || p_negocio::text));
  if p_perfil is not null then
    select limite_cola into v_limite from turno_perfiles where id = p_perfil;
    if v_limite is not null and v_limite > 0 then
      select count(*) into v_en_fila from turno_cola
        where perfil_id = p_perfil and estado in ('en_fila','llamado','en_camino','atendiendo');
      if v_en_fila >= v_limite then
        raise exception 'fila llena: este barbero no acepta más turnos por ahora';
      end if;
    end if;
  end if;

  v_prioridad := case when p_tipo_cola = 'digital' then 2 else 3 end;
  select coalesce(max(posicion) + 1, 1) into v_pos
    from turno_cola where negocio_id = p_negocio
     and estado in ('en_fila','llamado','en_camino','atendiendo');

  select coalesce(sum(s.duracion_min), 0)::int into v_espera
    from turno_cola q join turno_servicios s on s.id = q.servicio_id
   where q.negocio_id = p_negocio and q.estado = 'en_fila'
     and (q.prioridad < v_prioridad or (q.prioridad = v_prioridad and q.posicion < v_pos));
  v_espera := coalesce(v_espera, 0) + coalesce(public.turno_min_ocupada(p_perfil), 0);

  insert into turno_cola(negocio_id, perfil_id, cliente_id, servicio_id, tipo_cola, tipo_servicio,
                         prioridad, posicion, estado, eta_avisada_at)
  values (p_negocio, p_perfil, v_cliente, p_servicio, p_tipo_cola, v_tipo,
          v_prioridad, v_pos, 'en_fila', now() + make_interval(mins => v_espera))
  returning * into v_row;
  return v_row;
end $$;
