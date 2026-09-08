-- Dos bugs del motor de cola detectados usando la app en el piloto.
--
-- A) POSICIÓN RECICLADA: ambas funciones calculaban max(posicion)+1 filtrando
--    solo por estado='en_fila'. Al pasar alguien a 'llamado'/'en_camino' salía
--    del filtro, el máximo caía y el siguiente reusaba una posición ya dada.
--    Resultado real: dos personas en posición 1 y orden de fila ambiguo.
--    Ahora la posición se calcula sobre TODOS los estados activos.
--
-- B) tipo_servicio NULL EN WALK-INS: turno_registrar_fisico no rellenaba la
--    columna, así que la regla R1 (un turno activo por tipo) no cubría a los
--    clientes sin cita — en Postgres los NULL no colisionan en un índice
--    único, de modo que se podían duplicar sin límite.

create or replace function turno_entrar_a_cola(p_negocio uuid, p_servicio uuid, p_tipo_cola text default 'digital', p_perfil uuid default null)
returns turno_cola language plpgsql security definer set search_path to 'public' as $$
declare
  v_cliente uuid := public.turno_uid();
  v_pos int; v_prioridad int; v_limite int; v_en_fila int;
  v_tipo text; v_row public.turno_cola;
begin
  if v_cliente is null then raise exception 'no autenticado'; end if;
  if p_tipo_cola not in ('digital','fisica') then raise exception 'tipo_cola invalido'; end if;
  if not (p_negocio in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;
  select p.tipo_servicio into v_tipo
    from turno_servicios s join turno_perfiles p on p.id = s.perfil_id
   where s.id = p_servicio;
  v_tipo := coalesce(v_tipo, 'barbero');
  if exists(select 1 from turno_cola
            where cliente_id = v_cliente and tipo_servicio = v_tipo
              and estado in ('en_fila','llamado','en_camino')) then
    raise exception 'ya tienes un turno activo de este tipo de servicio';
  end if;
  perform pg_advisory_xact_lock(hashtext('turno_cola_' || p_negocio::text));
  if p_perfil is not null then
    select limite_cola into v_limite from turno_perfiles where id = p_perfil;
    if v_limite is not null and v_limite > 0 then
      select count(*) into v_en_fila from turno_cola
        where perfil_id = p_perfil and estado in ('en_fila','llamado','en_camino');
      if v_en_fila >= v_limite then
        raise exception 'fila llena: este barbero no acepta más turnos por ahora';
      end if;
    end if;
  end if;
  v_prioridad := case when p_tipo_cola = 'digital' then 2 else 3 end;
  -- Sobre todos los estados activos: si solo miramos 'en_fila', la posición se
  -- recicla en cuanto alguien es llamado.
  select coalesce(max(posicion) + 1, 1) into v_pos
    from turno_cola where negocio_id = p_negocio and estado in ('en_fila','llamado','en_camino');
  insert into turno_cola(negocio_id, perfil_id, cliente_id, servicio_id, tipo_cola, tipo_servicio, prioridad, posicion, estado)
  values (p_negocio, p_perfil, v_cliente, p_servicio, p_tipo_cola, v_tipo, v_prioridad, v_pos, 'en_fila')
  returning * into v_row;
  return v_row;
end $$;

create or replace function turno_registrar_fisico(p_negocio uuid, p_perfil uuid, p_servicio uuid, p_nombre text, p_telefono text)
returns turno_cola language plpgsql security definer set search_path to 'public' as $$
declare v_cli uuid; v_pos int; v_tipo text; v_row public.turno_cola;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not (p_negocio in (select public.turno_mis_negocios())) then raise exception 'sin acceso al negocio'; end if;

  -- Mismo criterio que la cola digital: el tipo lo define el perfil del servicio.
  select p.tipo_servicio into v_tipo
    from turno_servicios s join turno_perfiles p on p.id = s.perfil_id
   where s.id = p_servicio;
  v_tipo := coalesce(v_tipo, 'barbero');

  insert into turno_usuarios(nombre, telefono, tipo_usuario)
  values (p_nombre, coalesce(nullif(trim(p_telefono), ''), '-'), 'cliente')
  returning id into v_cli;
  insert into turno_membresias(usuario_id, negocio_id, rol, activo) values (v_cli, p_negocio, 'cliente', true);
  perform pg_advisory_xact_lock(hashtext('turno_cola_' || p_negocio::text));
  select coalesce(max(posicion) + 1, 1) into v_pos
    from turno_cola where negocio_id = p_negocio and estado in ('en_fila','llamado','en_camino');
  insert into turno_cola(negocio_id, perfil_id, cliente_id, servicio_id, tipo_cola, tipo_servicio, prioridad, posicion, estado)
  values (p_negocio, p_perfil, v_cli, p_servicio, 'fisica', v_tipo, 3, v_pos, 'en_fila')
  returning * into v_row;
  return v_row;
end $$;

-- Backfill: walk-ins ya creados sin tipo_servicio.
update turno_cola c
   set tipo_servicio = coalesce((
         select p.tipo_servicio from turno_servicios s
           join turno_perfiles p on p.id = s.perfil_id
          where s.id = c.servicio_id), 'barbero')
 where c.tipo_servicio is null;

-- Backfill: renumerar las colas activas por orden de llegada, para deshacer las
-- posiciones duplicadas que dejó el bug A.
with orden as (
  select id, row_number() over (partition by negocio_id order by prioridad, created_at) as n
    from turno_cola
   where estado in ('en_fila','llamado','en_camino')
)
update turno_cola c set posicion = o.n from orden o where o.id = c.id;
