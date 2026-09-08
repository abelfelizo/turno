-- =====================================================================
-- TURNO · Migración 19: código de barbero + identidad a nivel de persona
-- La identidad del barbero (foto, bio, especialidad, contactos) pasa a vivir
-- en turno_usuarios (la persona), no en turno_perfiles (por local), y gana un
-- código propio compartible. Así lo sigue a cualquier barbería.
-- =====================================================================

alter table public.turno_usuarios
  add column if not exists codigo_barbero text unique,
  add column if not exists foto_url       text,
  add column if not exists bio            text,
  add column if not exists especialidad   text,
  add column if not exists instagram      text,
  add column if not exists whatsapp       text;

-- ── Asignación automática del código a cualquier profesional ─────────
create or replace function public.turno_asignar_codigo_barbero()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_chars constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  v_code text; v_exists boolean; i int;
begin
  if new.tipo_usuario = 'profesional' and new.codigo_barbero is null then
    loop
      v_code := '';
      for i in 1..6 loop
        v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
      end loop;
      select exists(select 1 from turno_usuarios where codigo_barbero = v_code) into v_exists;
      exit when not v_exists;
    end loop;
    new.codigo_barbero := v_code;
  end if;
  return new;
end $$;

drop trigger if exists turno_usuarios_codigo on public.turno_usuarios;
create trigger turno_usuarios_codigo
  before insert or update on public.turno_usuarios
  for each row execute function public.turno_asignar_codigo_barbero();

-- ── Backfill: código para profesionales existentes ───────────────────
update public.turno_usuarios
   set updated_at = now()
 where tipo_usuario = 'profesional' and codigo_barbero is null;

-- ── Backfill: subir la identidad ya guardada en los perfiles ─────────
update public.turno_usuarios u set
  foto_url     = coalesce(u.foto_url, p.foto_url),
  bio          = coalesce(u.bio, p.bio),
  especialidad = coalesce(u.especialidad, p.especialidad),
  instagram    = coalesce(u.instagram, p.instagram),
  whatsapp     = coalesce(u.whatsapp, p.whatsapp)
from (
  select distinct on (usuario_id)
    usuario_id, foto_url, bio, especialidad, instagram, whatsapp
  from public.turno_perfiles
  order by usuario_id, updated_at desc nulls last
) p
where p.usuario_id = u.id;

-- ── Actualizar la identidad propia (solo columnas whitelisted) ───────
-- Cada texto: '' limpia, null conserva. La foto se pasa solo al subirla.
create or replace function public.turno_actualizar_identidad_barbero(
  p_foto text default null, p_bio text default null, p_especialidad text default null,
  p_instagram text default null, p_whatsapp text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'no autenticado'; end if;
  update turno_usuarios set
    foto_url     = coalesce(p_foto, foto_url),
    bio          = coalesce(p_bio, bio),
    especialidad = coalesce(p_especialidad, especialidad),
    instagram    = coalesce(p_instagram, instagram),
    whatsapp     = coalesce(p_whatsapp, whatsapp),
    updated_at   = now()
  where auth_id = auth.uid();
end $$;

-- ── Buscar barbero por su código (solo campos públicos) ──────────────
create or replace function public.turno_barbero_por_codigo(p_codigo text)
returns table(id uuid, nombre text, codigo_barbero text, foto_url text,
              bio text, especialidad text, instagram text)
language sql stable security definer set search_path = public as $$
  select id, nombre, codigo_barbero, foto_url, bio, especialidad, instagram
    from turno_usuarios
   where codigo_barbero = upper(p_codigo) and tipo_usuario = 'profesional'
   limit 1
$$;

grant execute on function public.turno_actualizar_identidad_barbero(text,text,text,text,text) to authenticated;
grant execute on function public.turno_barbero_por_codigo(text) to authenticated;
revoke execute on function public.turno_actualizar_identidad_barbero(text,text,text,text,text) from public, anon;
revoke execute on function public.turno_barbero_por_codigo(text) from public, anon;
