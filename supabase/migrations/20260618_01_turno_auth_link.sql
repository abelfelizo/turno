-- =====================================================================
-- TURNO · Fase 0 · Migración 1: enlace con Supabase Auth + helpers RLS
-- Solo afecta objetos con prefijo turno_. No toca Prestalo ni libro_*.
-- =====================================================================

-- 1) Enlazar turno_usuarios con auth.users
alter table public.turno_usuarios
  add column if not exists auth_id uuid unique references auth.users(id) on delete set null;
alter table public.turno_usuarios
  add column if not exists email text;

-- 2) Helpers (SECURITY DEFINER: corren como owner y NO disparan RLS,
--    evitando recursión en las políticas).

-- id de turno_usuarios del usuario autenticado actual
create or replace function public.turno_uid()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.turno_usuarios where auth_id = auth.uid()
$$;

-- negocios donde el usuario actual tiene membresía activa (cualquier rol)
create or replace function public.turno_mis_negocios()
returns setof uuid language sql stable security definer set search_path = public as $$
  select negocio_id from public.turno_membresias
  where usuario_id = public.turno_uid() and activo
$$;

-- negocios que el usuario actual administra (rol dueno)
create or replace function public.turno_negocios_admin()
returns setof uuid language sql stable security definer set search_path = public as $$
  select negocio_id from public.turno_membresias
  where usuario_id = public.turno_uid() and activo and rol = 'dueno'
$$;

-- ¿el perfil p pertenece al usuario actual?
create or replace function public.turno_es_mi_perfil(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.turno_perfiles
    where id = p and usuario_id = public.turno_uid()
  )
$$;

-- ¿el perfil p pertenece a alguno de mis negocios?
create or replace function public.turno_perfil_en_mis_negocios(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.turno_perfiles pr
    where pr.id = p and pr.negocio_id in (select public.turno_mis_negocios())
  )
$$;

-- usuarios visibles: los que comparten negocio conmigo
create or replace function public.turno_usuarios_de_mis_negocios()
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct usuario_id from public.turno_membresias
  where negocio_id in (select public.turno_mis_negocios())
$$;

-- 3) RPC de alta/actualización del usuario (controla el INSERT de identidad)
create or replace function public.turno_registrar_usuario(
  p_nombre text, p_telefono text, p_tipo text
) returns public.turno_usuarios
language plpgsql security definer set search_path = public as $$
declare v_row public.turno_usuarios;
begin
  if auth.uid() is null then
    raise exception 'no autenticado';
  end if;
  if p_tipo not in ('profesional','cliente') then
    raise exception 'tipo_usuario invalido: %', p_tipo;
  end if;
  insert into public.turno_usuarios (auth_id, nombre, telefono, tipo_usuario, email)
  values (auth.uid(), p_nombre, p_telefono, p_tipo, auth.jwt()->>'email')
  on conflict (auth_id) do update
    set nombre = excluded.nombre,
        telefono = excluded.telefono,
        updated_at = now()
  returning * into v_row;
  return v_row;
end $$;

grant execute on function public.turno_registrar_usuario(text,text,text) to authenticated;
