-- EL PORTERO NO PUEDE PARAR A QUIEN LIMPIA
--
-- Regresión mía, de la migración 73, encontrada al mirar por qué las citas
-- abandonadas de días anteriores no se cierran solas. El trigger que impide que
-- un CLIENTE marque su cita como atendida se estaba aplicando también al cron,
-- que no es nadie: corre sin sesión, así que turno_uid() es null, así que
-- v_staff es false, así que se le trata como al cliente y se le niega.
--
-- Reproducido contra la base, con una cita de hace tres días y sin sesión, que
-- es exactamente el contexto del cron:
--
--   turno_expirar_llamados() -> ERROR: esa parte de la cita la cierra el barbero
--   la cita quedó en: creada
--
-- Y no es solo esa cita. turno_expirar_llamados hace TRES cosas en una
-- transacción —vencer llamados, cerrar turnos olvidados y cerrar citas viejas—
-- así que al reventar la tercera se caen las tres. El trabajo que corre cada
-- minuto llevaba roto desde la 73 y no se notaba porque solo falla cuando hay
-- una cita vieja que cerrar: el día que aparece una, se para todo el
-- mantenimiento del sistema.
--
-- LA REGLA QUE FALTABA: sin sesión no hay cliente. turno_uid() null solo puede
-- ser el cron o una función del propio sistema; un cliente de verdad siempre
-- trae su sesión, y a un anónimo la política RLS no le enseña ni una fila (su
-- `using` compara contra turno_uid(), que para él también es null, así que no
-- encuentra nada que actualizar). El portero sigue en pie para quien tiene que
-- pararlo.

create or replace function turno_cita_escritura_del_cliente()
returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_staff boolean;
begin
  -- SIN SESIÓN NO HAY CLIENTE: es el mantenimiento (pg_cron) o una función
  -- SECURITY DEFINER del sistema cerrando lo que nadie cerró. Ver arriba.
  if public.turno_uid() is null then return new; end if;

  -- Quien atiende la cita, o el dueño del local. Los dos pueden cerrarla.
  v_staff := public.turno_es_mi_perfil(new.perfil_id)
          or (new.negocio_id in (select public.turno_negocios_admin()));
  if v_staff then return new; end if;

  -- A partir de aquí es el cliente escribiendo en su propia cita (la política
  -- ya no deja otra cosa). Solo puede decir tres cosas, y ninguna vale dinero.
  if new.estado is distinct from old.estado
     and new.estado not in ('confirmada', 'en_camino', 'cancelada') then
    raise exception 'esa parte de la cita la cierra el barbero';
  end if;

  -- Y no puede firmar el cobro por su cuenta aunque no cambie el estado.
  if new.atendida_at is distinct from old.atendida_at then
    raise exception 'esa parte de la cita la cierra el barbero';
  end if;

  return new;
end $$;

-- ── EL FANTASMA EN LA FILA ───────────────────────────────────────────────────
-- Lo de arriba destapa lo de abajo: en cuanto la limpieza vuelve a funcionar,
-- cada cita vieja pasa a 'no_llego', y CUALQUIER paso a 'no_llego' mete al
-- cliente en la fila con prioridad 1.
--
-- Esa regla es buena el día de la cita: el que reservó a las diez y llega a las
-- diez y cuarto no vuelve a la cola del final, entra por delante. Pero aplicada
-- a la limpieza de la madrugada significa que el cliente que faltó el martes
-- amanece el jueves DE PRIMERO en la fila de un barbero que no lo espera, por
-- un corte que nunca pidió. Basta con acotarla a lo que quería decir: hoy.
create or replace function turno_cita_a_cola_prioritaria()
returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_tipo text; v_hoy date;
begin
  if new.estado = 'no_llego' and old.estado <> 'no_llego' then
    select (now() at time zone coalesce(n.tz, 'America/Santo_Domingo'))::date
      into v_hoy from turno_negocios n where n.id = new.negocio_id;

    -- Un plantón de otro día ya no es una espera: es historia.
    if new.fecha is distinct from v_hoy then return new; end if;

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
             coalesce((select max(posicion) + 1 from turno_cola
                        where negocio_id = new.negocio_id
                          and estado in ('en_fila','llamado','en_camino','atendiendo')), 1),
             'en_fila', new.id;
    end if;
  end if;
  return new;
end $$;

comment on function turno_cita_a_cola_prioritaria is
  'Un plantón de HOY entra a la fila con prioridad 1: el que reservó a las diez '
  'y llega a las diez y cuarto no vuelve al final. Uno de otro día no: al '
  'cerrarse solas las citas viejas, metía en la fila de hoy a gente que faltó '
  'la semana pasada.';
