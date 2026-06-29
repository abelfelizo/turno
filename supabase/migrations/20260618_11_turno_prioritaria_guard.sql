-- =====================================================================
-- TURNO · Fix: cita no_llego → cola_prioritaria (caso 7) debe respetar
-- "un turno activo por cliente" (caso 18). Antes, si el cliente ya tenía
-- turno activo, el trigger fallaba con unique_violation y abortaba el
-- "marcar no llegó". Ahora solo crea la fila prioritaria si no hay turno
-- activo del cliente.
-- =====================================================================
create or replace function public.turno_cita_a_cola_prioritaria()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'no_llego' and old.estado <> 'no_llego' then
    if not exists (select 1 from turno_cola where cliente_id = new.cliente_id and estado in ('en_fila','llamado','en_camino')) then
      insert into turno_cola(negocio_id, perfil_id, cliente_id, servicio_id, tipo_cola, prioridad, posicion, estado, cita_origen_id)
      select new.negocio_id, new.perfil_id, new.cliente_id, new.servicio_id, 'digital', 1,
        coalesce((select max(posicion) + 1 from turno_cola where negocio_id = new.negocio_id and estado = 'en_fila'), 1),
        'en_fila', new.id;
    end if;
  end if;
  return new;
end $$;
