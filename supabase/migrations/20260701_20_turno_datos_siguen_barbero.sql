-- =====================================================================
-- TURNO · Migración 20: los datos siguen al barbero (persona)
-- Notas privadas a nivel persona + RPCs que agregan estadísticas, visitas
-- y clientes a través de TODOS los perfiles del barbero (todos sus locales).
-- =====================================================================

-- ── Notas privadas a nivel persona (siguen al barbero) ───────────────
create table if not exists public.turno_notas_barbero (
  id uuid primary key default gen_random_uuid(),
  usuario_barbero_id uuid not null references public.turno_usuarios(id) on delete cascade,
  cliente_id uuid not null references public.turno_usuarios(id) on delete cascade,
  nota text,
  updated_at timestamptz default now(),
  unique (usuario_barbero_id, cliente_id)
);

alter table public.turno_notas_barbero enable row level security;

drop policy if exists "turno_notas_barbero_rw" on public.turno_notas_barbero;
create policy "turno_notas_barbero_rw"
  on public.turno_notas_barbero for all to authenticated
  using (usuario_barbero_id = public.turno_uid())
  with check (usuario_barbero_id = public.turno_uid());

-- Backfill desde notas_privadas (por perfil) → notas por persona.
insert into public.turno_notas_barbero (usuario_barbero_id, cliente_id, nota, updated_at)
select distinct on (p.usuario_id, n.cliente_id)
  p.usuario_id, n.cliente_id, n.nota, n.updated_at
from public.turno_notas_privadas n
join public.turno_perfiles p on p.id = n.perfil_id
order by p.usuario_id, n.cliente_id, n.updated_at desc nulls last
on conflict (usuario_barbero_id, cliente_id) do nothing;

-- ── Estadísticas agregadas del barbero (todos sus locales) ───────────
create or replace function public.turno_mis_estadisticas()
returns table(total_ingresos numeric, clientes_unicos int, total_visitas int)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(precio_cobrado), 0)::numeric,
         count(distinct cliente_id)::int,
         count(*)::int
    from turno_historial_visitas
   where perfil_id in (select id from turno_perfiles where usuario_id = turno_uid())
$$;

-- Visitas recientes del barbero (todos sus locales).
create or replace function public.turno_mis_visitas(p_limit int default 20)
returns table(fecha date, origen text, precio_cobrado numeric, servicio text)
language sql stable security definer set search_path = public as $$
  select h.fecha, h.origen, h.precio_cobrado, s.nombre
    from turno_historial_visitas h
    left join turno_servicios s on s.id = h.servicio_id
   where h.perfil_id in (select id from turno_perfiles where usuario_id = turno_uid())
   order by h.fecha desc, h.created_at desc
   limit coalesce(p_limit, 20)
$$;

-- Clientes del barbero agregados por persona (todos sus locales).
create or replace function public.turno_mis_clientes()
returns table(cliente_id uuid, nombre text, telefono text, visitas int, total numeric, ultima date)
language sql stable security definer set search_path = public as $$
  select h.cliente_id, u.nombre, u.telefono,
         count(*)::int, coalesce(sum(h.precio_cobrado), 0)::numeric, max(h.fecha)
    from turno_historial_visitas h
    join turno_usuarios u on u.id = h.cliente_id
   where h.perfil_id in (select id from turno_perfiles where usuario_id = turno_uid())
   group by h.cliente_id, u.nombre, u.telefono
   order by max(h.fecha) desc
$$;

grant execute on function public.turno_mis_estadisticas() to authenticated;
grant execute on function public.turno_mis_visitas(int) to authenticated;
grant execute on function public.turno_mis_clientes() to authenticated;
revoke execute on function public.turno_mis_estadisticas() from public, anon;
revoke execute on function public.turno_mis_visitas(int) from public, anon;
revoke execute on function public.turno_mis_clientes() from public, anon;
