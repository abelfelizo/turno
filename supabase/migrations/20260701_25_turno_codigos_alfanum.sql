-- =====================================================================
-- TURNO · Migración 25: códigos "PREFIJO-XXXX" (3 letras + 4 alfanuméricos)
-- "Barbería Demo" → DEM-A2B1. El prefijo (3 letras de la palabra distintiva)
-- se mantiene reconocible; la segunda parte mezcla letras y números para dar
-- capacidad enorme (36^4 = 1,679,616 por prefijo). Único garantizado por
-- reintento + constraint UNIQUE. Se guarda con guion.
-- =====================================================================

create or replace function public.turno_gen_codigo(p_nombre text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_prefix text := public.turno_codigo_prefijo(p_nombre);
  v_chars constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  v_suf text; v_code text; i int;
begin
  loop
    v_suf := '';
    for i in 1..4 loop v_suf := v_suf || substr(v_chars, 1 + floor(random() * 36)::int, 1); end loop;
    v_code := v_prefix || '-' || v_suf;
    exit when not exists(select 1 from turno_negocios where codigo_acceso = v_code);
  end loop;
  return v_code;
end $$;

create or replace function public.turno_gen_codigo_barbero(p_nombre text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_prefix text := public.turno_codigo_prefijo(p_nombre);
  v_chars constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  v_suf text; v_code text; i int;
begin
  loop
    v_suf := '';
    for i in 1..4 loop v_suf := v_suf || substr(v_chars, 1 + floor(random() * 36)::int, 1); end loop;
    v_code := v_prefix || '-' || v_suf;
    exit when not exists(select 1 from turno_usuarios where codigo_barbero = v_code);
  end loop;
  return v_code;
end $$;

-- Regenerar los códigos demo con el formato nuevo (placeholders para no chocar
-- con el código viejo de la propia fila).
do $$
declare r record;
begin
  update turno_negocios set codigo_acceso = 'TMP-' || id::text;
  for r in select id, nombre from turno_negocios order by created_at loop
    update turno_negocios set codigo_acceso = public.turno_gen_codigo(r.nombre) where id = r.id;
  end loop;

  update turno_usuarios set codigo_barbero = 'TMP-' || id::text where tipo_usuario = 'profesional';
  for r in select id, nombre from turno_usuarios where tipo_usuario = 'profesional' order by created_at loop
    update turno_usuarios set codigo_barbero = public.turno_gen_codigo_barbero(r.nombre) where id = r.id;
  end loop;
end $$;
