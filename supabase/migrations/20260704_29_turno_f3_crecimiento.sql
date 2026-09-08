-- F3 · Crecimiento: asignación por dueño, canje de puntos, puntos por renta (R6),
-- clientes por recuperar (R7) y stats por período. Sólo objetos turno_.
-- (R5 reservas grupales queda fuera: choca con el índice único (cliente_id,
--  tipo_servicio) de R1 y necesita rediseño de la invariante, no un parche.)

-- ── Asignación por dueño ─────────────────────────────────────────────────────
create or replace function turno_asignar_cola(p_cola uuid, p_perfil uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_neg uuid;
begin
  select negocio_id into v_neg from turno_cola where id = p_cola;
  if v_neg is null then raise exception 'entrada inexistente'; end if;
  if not (v_neg in (select public.turno_negocios_admin())) then raise exception 'no autorizado'; end if;
  if not exists (select 1 from turno_perfiles where id = p_perfil and negocio_id = v_neg and activo) then
    raise exception 'ese profesional no pertenece al local';
  end if;
  update turno_cola set perfil_id = p_perfil where id = p_cola and estado in ('en_fila','llamado');
end $$;

-- ── R6: puntos por barbero rentado (priman sobre el negocio) ──────────────────
alter table turno_perfiles
  add column if not exists puntos_activos boolean not null default false,
  add column if not exists puntos_por_visita int,
  add column if not exists puntos_meta int;   -- visitas para el premio

-- El trigger de puntos ahora respeta la config del barbero_renta si la activó.
create or replace function turno_acumular_puntos()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_rol text; v_pf_activo boolean; v_pf_por int; v_cfg_activo boolean; v_cfg_por int; v_por int;
begin
  select p.puntos_activos, p.puntos_por_visita into v_pf_activo, v_pf_por
    from turno_perfiles p where p.id = NEW.perfil_id;
  select m.rol into v_rol
    from turno_perfiles p
    join turno_membresias m on m.usuario_id = p.usuario_id and m.negocio_id = NEW.negocio_id and m.activo
   where p.id = NEW.perfil_id limit 1;

  if v_rol = 'barbero_renta' and coalesce(v_pf_activo, false) and coalesce(v_pf_por, 0) > 0 then
    v_por := v_pf_por;
  else
    select c.puntos_activos, c.puntos_por_visita into v_cfg_activo, v_cfg_por
      from turno_configuracion_negocio c where c.negocio_id = NEW.negocio_id;
    if coalesce(v_cfg_activo, false) and coalesce(v_cfg_por, 0) > 0 then v_por := v_cfg_por; end if;
  end if;

  if v_por is not null and v_por > 0 then
    insert into turno_puntos(usuario_id, negocio_id, puntos_totales)
    values (NEW.cliente_id, NEW.negocio_id, v_por)
    on conflict (usuario_id, negocio_id)
    do update set puntos_totales = turno_puntos.puntos_totales + v_por, updated_at = now();
  end if;
  return NEW;
end $$;

-- ── Canje de puntos (vales) ──────────────────────────────────────────────────
create table if not exists turno_canjes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references turno_usuarios(id),
  negocio_id uuid not null references turno_negocios(id),
  perfil_id  uuid references turno_perfiles(id),
  puntos_costo int not null,
  estado text not null default 'vale' check (estado in ('vale','aplicado','anulado')),
  created_at timestamptz not null default now(),
  aplicado_at timestamptz
);
alter table turno_canjes enable row level security;

drop policy if exists turno_canjes_lectura on turno_canjes;
create policy turno_canjes_lectura on turno_canjes for select
  using (usuario_id = public.turno_uid() or negocio_id in (select public.turno_mis_negocios()));

-- Cliente emite un vale al llegar a la meta (descuenta puntos).
create or replace function turno_emitir_canje(p_negocio uuid)
returns turno_canjes language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := public.turno_uid(); v_por int; v_meta int; v_costo int; v_disp int; v_row turno_canjes;
begin
  if v_uid is null then raise exception 'no autenticado'; end if;
  select puntos_por_visita, visitas_para_gratis into v_por, v_meta
    from turno_configuracion_negocio where negocio_id = p_negocio;
  if not (coalesce(v_por, 0) > 0 and coalesce(v_meta, 0) > 0) then
    raise exception 'este local no tiene puntos configurados';
  end if;
  v_costo := v_por * v_meta;
  select coalesce(puntos_totales, 0) - coalesce(puntos_canjeados, 0) into v_disp
    from turno_puntos where usuario_id = v_uid and negocio_id = p_negocio;
  if coalesce(v_disp, 0) < v_costo then raise exception 'aún no tienes puntos suficientes'; end if;
  update turno_puntos set puntos_canjeados = coalesce(puntos_canjeados, 0) + v_costo, updated_at = now()
   where usuario_id = v_uid and negocio_id = p_negocio;
  insert into turno_canjes(usuario_id, negocio_id, puntos_costo)
    values (v_uid, p_negocio, v_costo) returning * into v_row;
  return v_row;
end $$;

-- Barbero/dueño aplica el vale al cobrar.
create or replace function turno_aplicar_canje(p_canje uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_neg uuid;
begin
  select negocio_id into v_neg from turno_canjes where id = p_canje and estado = 'vale';
  if v_neg is null then raise exception 'vale inexistente o ya usado'; end if;
  if not (v_neg in (select public.turno_mis_negocios())) then raise exception 'no autorizado'; end if;
  update turno_canjes
     set estado = 'aplicado', aplicado_at = now(),
         perfil_id = coalesce(perfil_id,
           (select id from turno_perfiles where usuario_id = public.turno_uid() and negocio_id = v_neg and activo limit 1))
   where id = p_canje;
end $$;

-- ── R7: clientes por recuperar (siguen al barbero, agregado por persona) ──────
alter table turno_perfiles add column if not exists revisita_dias int not null default 30;

create or replace function turno_clientes_por_recuperar(p_perfil uuid)
returns table(cliente_id uuid, nombre text, telefono text, ultima date, dias int)
language plpgsql security definer set search_path to 'public' as $$
declare v_usuario uuid; v_dias int;
begin
  select usuario_id, coalesce(revisita_dias, 30) into v_usuario, v_dias
    from turno_perfiles where id = p_perfil;
  if v_usuario is null then return; end if;
  return query
    with u as (
      select hv.cliente_id, max(hv.fecha) as ultima
        from turno_historial_visitas hv
       where hv.perfil_id in (select id from turno_perfiles where usuario_id = v_usuario)
       group by hv.cliente_id
    )
    select u.cliente_id, us.nombre, us.telefono, u.ultima, (current_date - u.ultima)::int
      from u join turno_usuarios us on us.id = u.cliente_id
     where (current_date - u.ultima) >= v_dias
     order by u.ultima asc;
end $$;

-- ── Stats por período (barbero y negocio) ────────────────────────────────────
create or replace function turno_stats_periodo_negocio(p_negocio uuid, p_desde date, p_hasta date)
returns table(ingresos numeric, visitas int, clientes int, ticket numeric)
language sql security definer set search_path to 'public' as $$
  select coalesce(sum(precio_cobrado), 0), count(*)::int,
         count(distinct cliente_id)::int, coalesce(avg(precio_cobrado), 0)
    from turno_historial_visitas
   where negocio_id = p_negocio and fecha between p_desde and p_hasta;
$$;

create or replace function turno_stats_periodo_perfil(p_perfil uuid, p_desde date, p_hasta date)
returns table(ingresos numeric, visitas int, clientes int, ticket numeric)
language sql security definer set search_path to 'public' as $$
  select coalesce(sum(precio_cobrado), 0), count(*)::int,
         count(distinct cliente_id)::int, coalesce(avg(precio_cobrado), 0)
    from turno_historial_visitas
   where perfil_id = p_perfil and fecha between p_desde and p_hasta;
$$;
