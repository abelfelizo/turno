-- DOS FALLOS DE LOS CRUCES
--
-- El camino feliz pasaba. Estos salieron al probar los obstáculos: qué ocurre
-- cuando hay fila Y agenda Y bloqueos a la vez.
--
-- ── A) SE PODÍA BLOQUEAR ENCIMA DE UNA CITA ─────────────────────────────────
--
-- El barbero bloquea "me voy, 14:30 a 16:00" y la cita confirmada de las 15:00
-- se queda viva. Él cree que tiene la tarde libre; el cliente aparece y no hay
-- nadie. Los dos lados de la app dicen la verdad por separado y juntos mienten.
--
-- El bloqueo se creaba con un INSERT directo desde la app, así que no había
-- ningún sitio donde comprobarlo. Se pone la comprobación en un trigger y no en
-- una RPC nueva: así cubre TODOS los caminos —el bloqueo manual, el "cliente
-- sin cita" que ocupa la silla, y cualquier cosa que se añada después—, que es
-- justo lo que falló en las otras tres versiones de este mismo error.
--
-- Se rechaza en vez de avisar: si el barbero quiere irse igual, primero cancela
-- la cita, y así el cliente se entera (ahora recibe push).
--
-- ── B) EL "NO LLEGÓ" METÍA TURNOS SIN tipo_servicio ─────────────────────────
--
-- Cuando una cita pasa a 'no_llego', el cliente entra a la fila con prioridad 1
-- para que no pierda su lugar. Ese trigger nunca recibió los arreglos de la
-- migración 33: dejaba tipo_servicio en NULL —y en Postgres los NULL no chocan
-- en un índice único, así que R1 no cubría a esos clientes y podían duplicar
-- turnos— y calculaba la posición mirando solo 'en_fila', que es como se
-- reciclaban posiciones ya dadas.
--
-- Tercer sitio con el mismo bug. Los tres estaban a la vista; lo que faltaba
-- era buscarlos.

create or replace function turno_bloqueo_sin_pisar_citas()
returns trigger language plpgsql set search_path to 'public' as $$
declare v_hora time;
begin
  select c.hora_inicio into v_hora
    from turno_citas c
   where c.perfil_id = NEW.perfil_id
     and c.fecha = NEW.fecha
     and c.estado in ('creada','confirmada','no_confirmada','en_camino')
     and c.hora_inicio < NEW.hora_fin
     and c.hora_fin > NEW.hora_inicio
   order by c.hora_inicio limit 1;

  if v_hora is not null then
    raise exception 'tienes una cita a las % en ese rango: cancélala primero',
      to_char(v_hora, 'HH12:MI AM');
  end if;
  return NEW;
end $$;

drop trigger if exists trg_turno_bloqueo_citas on turno_bloqueos;
create trigger trg_turno_bloqueo_citas
  before insert or update on turno_bloqueos
  for each row execute function turno_bloqueo_sin_pisar_citas();

create or replace function turno_cita_a_cola_prioritaria()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_tipo text;
begin
  if new.estado = 'no_llego' and old.estado <> 'no_llego' then
    -- 'atendiendo' cuenta como activo: sin él, alguien ya sentado recibiría un
    -- segundo turno por una cita perdida.
    if not exists (select 1 from turno_cola
                    where cliente_id = new.cliente_id
                      and estado in ('en_fila','llamado','en_camino','atendiendo')) then

      select p.tipo_servicio into v_tipo
        from turno_servicios s join turno_perfiles p on p.id = s.perfil_id
       where s.id = new.servicio_id;
      v_tipo := coalesce(v_tipo, 'barbero');

      insert into turno_cola(negocio_id, perfil_id, cliente_id, servicio_id, tipo_cola,
                             tipo_servicio, prioridad, posicion, estado, cita_origen_id)
      select new.negocio_id, new.perfil_id, new.cliente_id, new.servicio_id, 'digital',
             v_tipo, 1,
             -- Sobre TODOS los estados activos: mirando solo 'en_fila', la
             -- posición se recicla en cuanto alguien es llamado.
             coalesce((select max(posicion) + 1 from turno_cola
                        where negocio_id = new.negocio_id
                          and estado in ('en_fila','llamado','en_camino','atendiendo')), 1),
             'en_fila', new.id;
    end if;
  end if;
  return new;
end $$;
