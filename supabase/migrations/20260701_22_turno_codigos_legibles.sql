-- =====================================================================
-- TURNO · Migración 22: códigos legibles (3 letras del nombre + número)
-- Barbería "Barbería Demo" → BAR01 ; barbero "Carlos" → CAR01.
-- El número sube (01, 02, …) hasta encontrar uno libre → siempre único.
-- Separar letras (nombre) de números elimina la confusión 0/O, 1/I.
-- =====================================================================

-- Prefijo de 3 letras a partir del nombre (sin acentos, solo A–Z).
create or replace function public.turno_codigo_prefijo(p_nombre text)
returns text language plpgsql immutable set search_path = public as $$
declare v text;
begin
  v := upper(coalesce(p_nombre, ''));
  v := translate(v, 'ÁÉÍÓÚÜÑÀÈÌÒÙ', 'AEIOUUNAEIOU');
  v := regexp_replace(v, '[^A-Z]', '', 'g');
  v := left(v, 3);
  while length(v) < 3 loop
    v := v || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 1 + floor(random() * 26)::int, 1);
  end loop;
  return v;
end $$;

-- Código de barbería: prefijo del nombre + número correlativo libre.
create or replace function public.turno_gen_codigo(p_nombre text)
returns text language plpgsql security definer set search_path = public as $$
declare v_prefix text := public.turno_codigo_prefijo(p_nombre); v_code text; v_n int := 1;
begin
  loop
    v_code := v_prefix || lpad(v_n::text, 2, '0');
    exit when not exists(select 1 from turno_negocios where codigo_acceso = v_code);
    v_n := v_n + 1;
  end loop;
  return v_code;
end $$;

-- Código de barbero: mismo esquema, único entre usuarios.
create or replace function public.turno_gen_codigo_barbero(p_nombre text)
returns text language plpgsql security definer set search_path = public as $$
declare v_prefix text := public.turno_codigo_prefijo(p_nombre); v_code text; v_n int := 1;
begin
  loop
    v_code := v_prefix || lpad(v_n::text, 2, '0');
    exit when not exists(select 1 from turno_usuarios where codigo_barbero = v_code);
    v_n := v_n + 1;
  end loop;
  return v_code;
end $$;

-- El trigger de barbero ahora usa el generador legible.
create or replace function public.turno_asignar_codigo_barbero()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tipo_usuario = 'profesional' and new.codigo_barbero is null then
    new.codigo_barbero := public.turno_gen_codigo_barbero(new.nombre);
  end if;
  return new;
end $$;

-- Crear negocio ahora pasa el nombre al generador.
create or replace function public.turno_crear_negocio(
  p_nombre_negocio text, p_tipo text, p_moneda text,
  p_atiende boolean, p_tipo_servicio text,
  p_nombre_dueno text, p_telefono text,
  p_anticipacion int default 2, p_ventana int default 10, p_gracia int default 5,
  p_puntos_activos boolean default false, p_puntos_por_visita int default null,
  p_visitas_gratis int default null, p_asignacion_dueno boolean default false,
  p_doble_servicio boolean default false
) returns public.turno_negocios
language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_neg public.turno_negocios; v_codigo text;
begin
  if auth.uid() is null then raise exception 'no autenticado'; end if;
  if p_tipo not in ('espacios_rentados','empleados') then raise exception 'tipo invalido'; end if;
  insert into turno_usuarios(auth_id,nombre,telefono,tipo_usuario,email)
  values(auth.uid(),p_nombre_dueno,p_telefono,'profesional',auth.jwt()->>'email')
  on conflict(auth_id) do update set nombre=excluded.nombre, telefono=excluded.telefono, updated_at=now()
  returning id into v_uid;
  v_codigo := public.turno_gen_codigo(p_nombre_negocio);
  insert into turno_negocios(nombre,tipo,codigo_acceso,moneda)
  values(p_nombre_negocio,p_tipo,v_codigo,coalesce(p_moneda,'RD$'))
  returning * into v_neg;
  insert into turno_configuracion_negocio(
    negocio_id,anticipacion_minima_horas,ventana_llegada_min,gracia_cita_min,
    puntos_activos,puntos_por_visita,visitas_para_gratis,asignacion_por_dueno,doble_servicio_activo)
  values(v_neg.id,p_anticipacion,p_ventana,p_gracia,
    p_puntos_activos,p_puntos_por_visita,p_visitas_gratis,p_asignacion_dueno,p_doble_servicio);
  insert into turno_membresias(usuario_id,negocio_id,rol,activo) values(v_uid,v_neg.id,'dueno',true);
  if p_atiende then
    insert into turno_perfiles(usuario_id,negocio_id,tipo_servicio,activo,aprobado,estado_actual)
    values(v_uid,v_neg.id,coalesce(p_tipo_servicio,'barbero'),true,true,'disponible');
  end if;
  return v_neg;
end $$;

-- Regenerar los códigos existentes (datos de prueba). Fila por fila para que
-- cada nuevo código sea visible al siguiente (evita choques en el mismo lote).
do $$
declare r record;
begin
  for r in select id, nombre from turno_negocios order by created_at loop
    update turno_negocios set codigo_acceso = public.turno_gen_codigo(r.nombre) where id = r.id;
  end loop;
  for r in select id, nombre from turno_usuarios where tipo_usuario='profesional' order by created_at loop
    update turno_usuarios set codigo_barbero = public.turno_gen_codigo_barbero(r.nombre) where id = r.id;
  end loop;
end $$;

grant execute on function public.turno_gen_codigo(text) to authenticated;
grant execute on function public.turno_gen_codigo_barbero(text) to authenticated;
revoke execute on function public.turno_gen_codigo(text) from public, anon;
revoke execute on function public.turno_gen_codigo_barbero(text) from public, anon;
