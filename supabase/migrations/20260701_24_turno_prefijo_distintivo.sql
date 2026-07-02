-- =====================================================================
-- TURNO · Migración 24: prefijo distintivo (salta palabras genéricas)
-- "Barbería Demo" → DEM (no BAR) ; "Studio Glow" → GLO (no STU).
-- Toma la primera palabra que NO sea genérica; si todas lo son, usa el
-- nombre completo como antes. Reparte los prefijos y los hace reconocibles.
-- =====================================================================

create or replace function public.turno_codigo_prefijo(p_nombre text)
returns text language plpgsql immutable set search_path = public as $$
declare
  v text; v_words text[]; w text; v_pick text := '';
  v_stop text[] := array[
    'BARBERIA','BARBERIAS','BARBER','BARBERS','BARBERSHOP','BARBERSHOPS',
    'SALON','SALONES','PELUQUERIA','ESTETICA','SPA','STUDIO','ESTUDIO',
    'SHOP','STORE','EL','LA','LOS','LAS','DE','DEL','Y','THE','DON','DONA'
  ];
begin
  v := upper(coalesce(p_nombre, ''));
  v := translate(v, 'ÁÉÍÓÚÜÑÀÈÌÒÙ', 'AEIOUUNAEIOU');
  v := regexp_replace(v, '[^A-Z ]', ' ', 'g');            -- solo letras y espacios
  v_words := regexp_split_to_array(trim(v), '\s+');
  -- primera palabra distintiva (no genérica)
  foreach w in array v_words loop
    if length(w) >= 1 and not (w = any(v_stop)) then v_pick := w; exit; end if;
  end loop;
  -- si todas eran genéricas (o el nombre venía vacío), usar todo junto
  if v_pick = '' then v_pick := regexp_replace(v, '\s', '', 'g'); end if;
  v_pick := left(v_pick, 3);
  while length(v_pick) < 3 loop
    v_pick := v_pick || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 1 + floor(random() * 26)::int, 1);
  end loop;
  return v_pick;
end $$;

-- Regenerar los códigos demo con el prefijo nuevo. Fase 1: placeholders únicos
-- (evita chocar con el propio código viejo). Fase 2: generar el definitivo.
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
