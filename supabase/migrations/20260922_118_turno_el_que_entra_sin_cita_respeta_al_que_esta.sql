-- ═══════════════════════════════════════════════════════════════════════════
-- 118 · EL QUE ENTRA SIN CITA RESPETA AL QUE ESTÁ, NO AL QUE VIENE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- APLICADA el 22 sep con el visto bueno del dueño del producto. Antes de
-- aplicarla se copió la definición viva a supabase/rollback_118_…sql, por si
-- hubiera que volver a la regla vieja. En la app, lib/silla.ts pasó a
-- REGLA_WALK_IN = 'nadie_presente'. Pruebas: sin_cita.test.sql sección 4 y
-- motor_cola.test.sql caso 20, corridas contra la base en verde (27/27, 34/34).
--
-- LA REGLA DECIDIDA (22 sep, por el dueño del producto):
--
--   «Lo ideal es que se respete la fila, pero si los demás no están en el
--    local, el barbero, si tiene el tiempo, puede atender a quien entre.
--    No entra a la fila: solo se atiende como walk-in.»
--
-- LO QUE HACÍA HASTA AHORA (migración 107): con CUALQUIERA en la fila —en el
-- local o en su casa— rechazaba al que entra por la puerta: «hay N
-- esperando». Eso deja la silla vacía mirando la puerta mientras quien pidió
-- turno desde el teléfono todavía no ha salido de casa, y al que está de pie
-- delante se le manda a esperar a alguien que no está.
--
-- LO QUE HACE AHORA. Bloquean al que entra sin cita:
--
--   · quien ya fue LLAMADO o viene en camino: su ventana de llegada corre, y
--     sentar a otro le haría esperar a él después de haberle dicho que venga;
--   · quien espera Y ESTÁ AQUÍ: la fila física —que el barbero registró con la
--     persona delante— o el de la app que dijo «ya llegué» (`llego_at`);
--   · el segundo turno de un doble servicio (`espera_a_id`): está en el local,
--     en la otra silla, y va a necesitar esta en cuanto acabe.
--
-- NO bloquea quien espera en la app y todavía no ha llegado. Su espera se
-- corre lo que dure el corte, y la app se lo avisa (avisosDeEspera, igual que
-- con cualquier otro cambio de la fila).
--
-- «SI TIENE EL TIEMPO» NO VIVE AQUÍ, a propósito. Depende del servicio que
-- pida y de la próxima cita, y la agenda ya protege las citas: la pantalla
-- apaga los servicios que no caben antes de la siguiente, y dice por qué.
-- Poner aquí esa cuenta sería duplicar la regla de la agenda con otro reloj.
--
-- Todo lo demás de la función queda EXACTAMENTE como estaba en la 107
-- (copiado de la definición viva, no del fichero): el portero de «capta por
-- su cuenta», el servicio que tiene que ser suyo, el candado de la cola, la
-- silla ocupada, y cómo se registra el cliente y su turno.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.turno_atender_sin_cita(
  p_negocio uuid, p_perfil uuid, p_servicio uuid,
  p_nombre text default null, p_telefono text default null)
returns public.turno_cola
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cli uuid; v_pos int; v_dur int; v_tipo text; v_row public.turno_cola; v_esperando int;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not (p_negocio in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;
  if not public.turno_perfil_operable(p_perfil) then
    raise exception 'tu perfil todavía no está aprobado en este local';
  end if;
  if not public.turno_capta_por_su_cuenta(p_perfil) then
    raise exception 'aquí los clientes te los asigna la barbería. Si quieres poder sentar a alguien tú, pide que te activen «aceptar clientes por mi cuenta».';
  end if;

  select s.duracion_min, (select pf.tipo_servicio from turno_perfiles pf where pf.id = s.perfil_id)
    into v_dur, v_tipo
    from turno_servicios s where s.id = p_servicio and s.perfil_id = p_perfil;
  if v_dur is null then raise exception 'ese servicio no es tuyo'; end if;
  v_tipo := coalesce(v_tipo, 'barbero');

  perform pg_advisory_xact_lock(hashtext('turno_cola_' || p_negocio::text));

  -- LO ÚNICO QUE CAMBIA. Antes contaba a todo el que estuviera en la fila.
  select count(*) into v_esperando
    from turno_cola q
   where q.negocio_id = p_negocio
     and (q.perfil_id is null or q.perfil_id = p_perfil)
     and (   q.estado in ('llamado', 'en_camino')
          or (q.estado = 'en_fila'
              and (q.tipo_cola = 'fisica' or q.llego_at is not null or q.espera_a_id is not null)));
  if v_esperando > 0 then
    raise exception 'hay % esperando aquí: llama al siguiente, o marca ausente a quien no llegó', v_esperando;
  end if;

  if exists (select 1 from turno_cola q
              where q.perfil_id = p_perfil and q.estado = 'atendiendo') then
    raise exception 'ya tienes a alguien en la silla';
  end if;

  insert into turno_usuarios(nombre, telefono, tipo_usuario)
  values (coalesce(nullif(trim(p_nombre), ''), 'Cliente sin cita'),
          coalesce(nullif(trim(p_telefono), ''), '-'), 'cliente')
  returning id into v_cli;
  insert into turno_membresias(usuario_id, negocio_id, rol, activo)
  values (v_cli, p_negocio, 'cliente', true);

  select coalesce(max(posicion) + 1, 1) into v_pos
    from turno_cola where negocio_id = p_negocio
     and estado in ('en_fila','llamado','en_camino','atendiendo');

  insert into turno_cola(negocio_id, perfil_id, cliente_id, servicio_id, tipo_cola, tipo_servicio,
                         prioridad, posicion, estado, llamado_at, atendiendo_at)
  values (p_negocio, p_perfil, v_cli, p_servicio, 'fisica', v_tipo,
          3, v_pos, 'atendiendo', now(), now())
  returning * into v_row;

  return v_row;
end $function$;
