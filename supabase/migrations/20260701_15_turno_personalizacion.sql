-- =====================================================================
-- TURNO · Migración 15: personalización de barbero y negocio (marca)
-- Añade campos de identidad al perfil del barbero y de marca/contacto al
-- negocio, más un bucket de Storage para fotos de perfil y logos.
-- Respeta el constraint de infraestructura: SOLO objetos turno_*.
-- =====================================================================

-- ── Perfil del barbero (lo controla el propio barbero vía RLS) ────────
alter table public.turno_perfiles
  add column if not exists bio                text,
  add column if not exists especialidad       text,
  add column if not exists mensaje_bienvenida text,
  add column if not exists instagram          text,
  add column if not exists whatsapp           text;

-- ── Negocio / marca (lo controla el dueño = turno_negocios_admin) ─────
-- direccion y telefono ya existían; añadimos identidad de marca.
alter table public.turno_negocios
  add column if not exists logo_url    text,
  add column if not exists slogan      text,
  add column if not exists instagram   text,
  add column if not exists color_marca text;

-- ── Storage: bucket público para fotos de perfil y logos ─────────────
insert into storage.buckets (id, name, public)
values ('turno-perfiles', 'turno-perfiles', true)
on conflict (id) do nothing;

-- Lectura pública (las fotos se muestran a los clientes).
drop policy if exists "turno_perfiles_bucket_read" on storage.objects;
create policy "turno_perfiles_bucket_read"
  on storage.objects for select
  using (bucket_id = 'turno-perfiles');

-- Escritura solo para usuarios autenticados, acotada a este bucket.
drop policy if exists "turno_perfiles_bucket_insert" on storage.objects;
create policy "turno_perfiles_bucket_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'turno-perfiles');

drop policy if exists "turno_perfiles_bucket_update" on storage.objects;
create policy "turno_perfiles_bucket_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'turno-perfiles')
  with check (bucket_id = 'turno-perfiles');

drop policy if exists "turno_perfiles_bucket_delete" on storage.objects;
create policy "turno_perfiles_bucket_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'turno-perfiles');
