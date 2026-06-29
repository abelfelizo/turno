-- =====================================================================
-- TURNO · Walk-in (caso 4): el barbero registra un cliente físico
-- (sin app) directamente a la cola. SECURITY DEFINER: crea el usuario
-- físico y la fila en nombre del cliente.
-- =====================================================================
create or replace function public.turno_registrar_fisico(
  p_negocio uuid, p_perfil uuid, p_servicio uuid, p_nombre text, p_telefono text
) returns public.turno_cola
language plpgsql security definer set search_path = public as $$
declare v_cli uuid; v_pos int; v_row public.turno_cola;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not (p_negocio in (select public.turno_mis_negocios())) then raise exception 'sin acceso al negocio'; end if;
  insert into turno_usuarios(nombre, telefono, tipo_usuario)
  values (p_nombre, coalesce(nullif(trim(p_telefono), ''), '-'), 'cliente')
  returning id into v_cli;
  insert into turno_membresias(usuario_id, negocio_id, rol, activo) values (v_cli, p_negocio, 'cliente', true);
  perform pg_advisory_xact_lock(hashtext('turno_cola_' || p_negocio::text));
  select coalesce(max(posicion) + 1, 1) into v_pos from turno_cola where negocio_id = p_negocio and estado = 'en_fila';
  insert into turno_cola(negocio_id, perfil_id, cliente_id, servicio_id, tipo_cola, prioridad, posicion, estado)
  values (p_negocio, p_perfil, v_cli, p_servicio, 'fisica', 3, v_pos, 'en_fila')
  returning * into v_row;
  return v_row;
end $$;

grant execute on function public.turno_registrar_fisico(uuid,uuid,uuid,text,text) to authenticated;
revoke execute on function public.turno_registrar_fisico(uuid,uuid,uuid,text,text) from public, anon;
