-- EL DOBLE SERVICIO ES UNO DETRÁS DEL OTRO
--
-- Lo que la app llamaba «doble servicio» no era esto. El interruptor
-- `doble_servicio_activo` sólo relajaba una comprobación en
-- `turno_entrar_a_cola`: con él encendido, un cliente podía tener DOS turnos
-- activos a la vez si eran de oficios distintos. Dos turnos sueltos, en
-- paralelo, sin relación entre ellos. Nadie garantizaba que el segundo
-- empezara después del primero, y de hecho podían llamarle a la manicura
-- mientras estaba sentado cortándose el pelo.
--
-- Y las columnas que parecían implementarlo —`turno_citas.perfil_2_id` y
-- `turno_citas.servicio_2_id`— no las lee ni las escribe **ninguna** función.
-- Llevaban ahí desde el principio sin hacer nada.
--
-- Lo que se quiere es: **uno detrás del otro, con dos personas distintas.**
-- Primero el barbero, después la manicurista. Eso es lo que esta migración
-- construye.
--
-- ── CÓMO SE DICE «ESPERA A QUE ACABE AQUÉL» ─────────────────────────────────
-- Una columna: `turno_cola.espera_a_id`. Mientras no sea nula, ese turno NO se
-- llama — ni por `turno_llamar_siguiente`, ni a mano con `turno_llamar_a`, ni
-- se cuenta como «hay alguien antes en la fila».
--
-- Y se vacía sola. Un disparador la limpia en cuanto el turno del que depende
-- llega a un estado final, sea el bueno o uno malo. Eso resuelve de un golpe
-- el caso que si no deja al cliente colgado para siempre: si el primer
-- servicio se abandona o expira, el segundo no puede quedarse esperando a algo
-- que ya no va a pasar. Se suelta y pasa a ser un turno normal — que es lo
-- menos destructivo: si el cliente se fue, el circuito de ausencias ya se
-- encarga; y si sigue ahí, no se le castiga quitándole la manicura porque el
-- corte saliera mal.
--
-- NO se toca `turno_citas`: encadenar dos CITAS con hora es otra conversación
-- (hay que cuadrar dos agendas a la vez). Esto es para la fila, que es donde
-- pasa de verdad en una barbería llena.

-- ── 1. LA COLUMNA ───────────────────────────────────────────────────────────

alter table turno_cola add column if not exists espera_a_id uuid
  references turno_cola(id) on delete set null;

alter table turno_cola drop constraint if exists turno_cola_espera_a_no_es_el_mismo;
alter table turno_cola add constraint turno_cola_espera_a_no_es_el_mismo
  check (espera_a_id is null or espera_a_id <> id);

-- Con índice desde el día uno: el disparador de abajo busca POR esta columna
-- cada vez que un turno termina, o sea constantemente. Ver migración 112.
create index if not exists turno_cola_espera_a_id_idx on turno_cola (espera_a_id);

-- ── 2. SE SUELTA SOLO ───────────────────────────────────────────────────────

create or replace function public.turno_soltar_al_que_espera()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado in ('atendido','expirado','abandonado','reinsertado')
     and old.estado is distinct from new.estado then
    update turno_cola set espera_a_id = null where espera_a_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists turno_soltar_al_que_espera on turno_cola;
create trigger turno_soltar_al_que_espera
  after update on turno_cola
  for each row execute function public.turno_soltar_al_que_espera();

-- ── 3. AL SEGUNDO NO SE LE LLAMA ANTES DE TIEMPO ────────────────────────────

create or replace function public.turno_llamar_siguiente(p_negocio uuid, p_perfil uuid default null)
returns turno_cola language plpgsql volatile security definer set search_path = public as $$
declare v_ventana int; v_gracia int; v_tz text; v_ahora timestamp; v_row public.turno_cola;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not (p_negocio in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;
  if p_perfil is not null then
    if not public.turno_perfil_operable(p_perfil) then
      raise exception 'tu perfil todavía no está aprobado en este local';
    end if;
    if not public.turno_capta_por_su_cuenta(p_perfil) then
      raise exception 'aquí el siguiente cliente te lo asigna la barbería. Si quieres llamar tú, pide que te activen «aceptar clientes por mi cuenta».';
    end if;
  else
    if not (p_negocio in (select public.turno_negocios_admin())) then
      raise exception 'llamar al siguiente del local lo hace quien dirige la barbería';
    end if;
  end if;

  v_ventana := public.turno_regla_tiempo(p_perfil, p_negocio, 'ventana_llegada_min');
  v_gracia  := public.turno_regla_tiempo(p_perfil, p_negocio, 'gracia_cita_min');
  select coalesce(tz, 'America/Santo_Domingo') into v_tz from turno_negocios where id = p_negocio;
  v_ahora := (now() at time zone v_tz);

  if p_perfil is not null and exists(
       select 1 from turno_citas
        where perfil_id = p_perfil and fecha = v_ahora::date and estado = 'confirmada'
          and v_ahora between (fecha + hora_inicio) - make_interval(mins => v_ventana)
                          and (fecha + hora_fin)    + make_interval(mins => v_gracia)) then
    return null;
  end if;

  select * into v_row from turno_cola
   where negocio_id = p_negocio and estado = 'en_fila'
     -- El segundo servicio no entra en el sorteo hasta que el primero acaba.
     and espera_a_id is null
     and (p_perfil is null or perfil_id is null or perfil_id = p_perfil)
   order by prioridad asc, posicion asc
   for update skip locked
   limit 1;
  if v_row.id is null then return null; end if;
  update turno_cola
     set estado = 'llamado', perfil_id = coalesce(perfil_id, p_perfil),
         llamado_at = now(), expira_at = now() + make_interval(mins => v_ventana)
   where id = v_row.id
   returning * into v_row;
  return v_row;
end $$;

revoke execute on function public.turno_llamar_siguiente(uuid, uuid) from public, anon;
grant  execute on function public.turno_llamar_siguiente(uuid, uuid) to authenticated;

create or replace function public.turno_llamar_a(p_cola uuid)
returns turno_cola language plpgsql volatile security definer set search_path = public as $$
declare v public.turno_cola; v_sig uuid; v_ventana int;
begin
  v := public.turno_cola_operable(p_cola);
  if v.estado <> 'en_fila' then raise exception 'ese turno no está esperando'; end if;

  -- Llamar A MANO tampoco se salta el orden del doble servicio: si se pudiera,
  -- la regla viviría sólo en la función automática y bastaría con tocar el
  -- nombre en la lista para romperla.
  if v.espera_a_id is not null then
    raise exception 'ese cliente está en el primer servicio: su segundo turno se abre cuando termine';
  end if;

  if v.perfil_id is not null then
    if not public.turno_capta_por_su_cuenta(v.perfil_id) then
      raise exception 'aquí el siguiente cliente te lo asigna la barbería. Si quieres llamar tú, pide que te activen «aceptar clientes por mi cuenta».';
    end if;
  else
    if not (v.negocio_id in (select public.turno_negocios_admin())) then
      raise exception 'llamar al siguiente del local lo hace quien dirige la barbería';
    end if;
  end if;

  select q.id into v_sig
    from turno_cola q
   where q.negocio_id = v.negocio_id and q.estado = 'en_fila'
     -- Y un turno bloqueado tampoco cuenta como «hay alguien antes»: si
     -- contara, el barbero no podría llamar a nadie mientras ese cliente
     -- estuviera en la otra silla.
     and q.espera_a_id is null
     and (v.perfil_id is null or q.perfil_id is null or q.perfil_id = v.perfil_id)
   order by q.prioridad asc, q.posicion asc
   limit 1;

  if v_sig is distinct from p_cola then
    raise exception 'no puedes adelantarlo: hay alguien antes en la fila';
  end if;

  v_ventana := public.turno_regla_tiempo(v.perfil_id, v.negocio_id, 'ventana_llegada_min');
  update turno_cola
     set estado = 'llamado', llamado_at = now(),
         expira_at = now() + make_interval(mins => v_ventana)
   where id = p_cola
   returning * into v;
  return v;
end $$;

revoke execute on function public.turno_llamar_a(uuid) from public, anon;
grant  execute on function public.turno_llamar_a(uuid) to authenticated;

-- ── 4. PEDIR LOS DOS DE UNA VEZ ─────────────────────────────────────────────
-- Se apoya en `turno_entrar_a_cola` para cada mitad en vez de insertar a mano:
-- así los porteros —fila abierta, local operativo, límite de cola, cobro al
-- día— se comprueban una sola vez y en un solo sitio. Lo único que añade esta
-- función es lo que hace que sean UN doble servicio y no dos turnos sueltos.

create or replace function public.turno_entrar_a_cola_doble(
  p_negocio uuid, p_servicio_1 uuid, p_servicio_2 uuid,
  p_tipo_cola text default 'digital',
  p_perfil_1 uuid default null, p_perfil_2 uuid default null)
returns setof turno_cola language plpgsql volatile security definer set search_path = public as $$
declare
  v_doble boolean; v_t1 text; v_t2 text;
  v_a public.turno_cola; v_b public.turno_cola; v_dur int;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if p_servicio_1 = p_servicio_2 then
    raise exception 'son dos servicios distintos';
  end if;

  select coalesce(doble_servicio_activo, true) into v_doble
    from turno_configuracion_negocio where negocio_id = p_negocio;
  if not coalesce(v_doble, true) then
    raise exception 'este local no encadena dos servicios en la misma visita';
  end if;

  -- DOS OFICIOS DISTINTOS. Si fueran el mismo no habría nada que coordinar:
  -- sería pedir turno dos veces con el mismo barbero, que es otra cosa.
  select p.tipo_servicio into v_t1 from turno_servicios s
    join turno_perfiles p on p.id = s.perfil_id where s.id = p_servicio_1;
  select p.tipo_servicio into v_t2 from turno_servicios s
    join turno_perfiles p on p.id = s.perfil_id where s.id = p_servicio_2;
  if v_t1 is null or v_t2 is null then raise exception 'ese servicio no existe'; end if;
  if v_t1 = v_t2 then
    raise exception 'el doble servicio es con dos oficios distintos: por ejemplo barbero y luego manicurista';
  end if;
  if p_perfil_1 is not null and p_perfil_1 = p_perfil_2 then
    raise exception 'el segundo servicio lo hace otra persona';
  end if;

  v_a := public.turno_entrar_a_cola(p_negocio, p_servicio_1, p_tipo_cola, p_perfil_1);
  v_b := public.turno_entrar_a_cola(p_negocio, p_servicio_2, p_tipo_cola, p_perfil_2);

  -- Se vuelve a mirar DESPUÉS porque cualquiera de los dos pudo entrar sin
  -- barbero elegido y que se lo asignara el sistema. Dos oficios distintos
  -- deberían bastar, pero la regla es «dos personas» y se comprueba como tal.
  if v_a.perfil_id is not null and v_a.perfil_id = v_b.perfil_id then
    raise exception 'el segundo servicio lo hace otra persona';
  end if;

  select duracion_min into v_dur from turno_servicios where id = p_servicio_1;

  update turno_cola
     set espera_a_id = v_a.id,
         -- La espera del segundo no empieza a contar hasta que el primero
         -- termina: si no, al cliente se le anuncia una hora imposible.
         eta_avisada_at = greatest(
           coalesce(eta_avisada_at, now()),
           coalesce(v_a.eta_avisada_at, now()) + make_interval(mins => coalesce(v_dur, 0)))
   where id = v_b.id
   returning * into v_b;

  return next v_a;
  return next v_b;
end $$;

revoke execute on function public.turno_entrar_a_cola_doble(uuid, uuid, uuid, text, uuid, uuid) from public, anon;
grant  execute on function public.turno_entrar_a_cola_doble(uuid, uuid, uuid, text, uuid, uuid) to authenticated;
