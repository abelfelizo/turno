-- AL EMPLEADO EL TRABAJO SE LO DAN
--
-- De las reglas nuevas, la del perfil empleado: «no puede configurar negocio,
-- ni horario, ni reglas. Solo acepta clientes por su cuenta SI LE DAN PERMISO.
-- Recibe lo que la barbería le manda. No gestiona fila, solo puede gestionar al
-- turno del momento.»
--
-- Antes de escribir nada se probó qué puede hoy un empleado, llamando a cada
-- función con una sesión suya contra la base real. Salió esto:
--
--   PUEDE · llamar_siguiente        ← se sirve de la fila él solo
--   PUEDE · atender_sin_cita        ← se mete un walk-in él solo
--   PUEDE · cerrar_jornada          ← se queda así: ver el apartado 3
--   PUEDE · sacar_de_cola           ← (se trata en la 108, no aquí)
--   no puede · alargar_jornada, reglas, mover_en_cola, asignar_cola,
--              las cuentas del local, suspender, cambiar el tipo de negocio
--
-- Dos cosas que conviene dejar escritas porque casi se cuelan como conclusión:
--
-- 1) En la PRIMERA pasada `atender_sin_cita` salió "cerrado", y era mentira: un
--    paso anterior de la misma sonda ya le había sentado a alguien, así que
--    rebotaba por SILLA OCUPADA, no por falta de permiso. **Un portero se
--    prueba con la puerta que de verdad existe** — la lección de la 89, otra vez.
--
-- 2) `turno_mis_estadisticas` pareció cerrada para el empleado y no lo está: la
--    sonda la llamaba con un argumento y la función no lleva ninguno. Va atada a
--    `turno_uid()`, así que el empleado ya ve solo lo suyo. Esa regla estaba
--    cumplida desde antes.
--
-- ── LA PREGUNTA QUE HAY QUE HACER, Y LA QUE NO ──────────────────────────────
-- El primer intento preguntó `turno_manda_en_la_silla` y no cerró nada. Esa
-- función significa **«esta silla es mía, o soy su jefe»**, y la silla del
-- empleado es suya, así que contestaba que sí a todo el mundo.
--
-- La pregunta correcta es la de la R11, `turno_manda_en_el_horario`:
--
--   (es mi perfil Y soy autónomo)  OR  (soy admin del local Y el perfil NO lo es)
--
-- Las dos se parecen y dicen cosas distintas. Conviene tenerlo escrito porque
-- elegir la equivocada no da error: la migración se aplica, las pruebas de
-- "se cerró de más" pasan, y el portero simplemente no muerde.
--
-- ── EL PERMISO ──────────────────────────────────────────────────────────────
-- La regla no dice «el empleado nunca», dice «solo si le dan permiso». Eso es
-- una columna, no un rol: `acepta_por_su_cuenta`, que **nace en false** porque
-- el permiso hay que darlo, no quitarlo.
--
-- Y no se pregunta sola. Se pregunta junto a la R11, en
-- `turno_capta_por_su_cuenta`:
--
--   manda en el horario  OR  (es su silla Y le dieron el permiso)
--
-- Con eso sale gratis lo correcto para todos los demás, sin casos especiales:
--   · el independiente que renta manda en su silla       → puede, siempre
--   · el dueño de un local de empleados, en la suya      → puede, siempre
--   · ese mismo dueño, en la silla de su empleado        → puede («lo que la
--     barbería le manda» lo manda alguien: él)
--   · el empleado, en la suya                            → solo con el permiso
--
-- ── `llamar_siguiente` SIN SILLA ────────────────────────────────────────────
-- Esa función acepta `p_perfil = null` (llamar al siguiente del local, sin
-- silla concreta) y en ese caso lo único que comprobaba era pertenecer al
-- negocio. Si se cerrara solo el camino con silla, el empleado se serviría de
-- la fila mandando null y el permiso no valdría nada. Por eso el camino sin
-- silla pasa a exigir ser administrador del local, que es lo que significa
-- «repartir el trabajo».
--
-- ── LA TERCERA PUERTA, QUE CASI SE QUEDA ABIERTA ───────────────────────────
-- `turno_llamar_a(turno)` llama a UNA persona concreta, y solo comprobaba que
-- fuera la primera de la fila. O sea: el empleado sin permiso se servía igual,
-- llamando por id en vez de «el siguiente». Comprobado contra la base antes de
-- cerrarla — el turno quedó en 'llamado'.
--
-- **Un permiso con tres puertas y dos cerradas no es un permiso.** Es la misma
-- forma del fallo número uno de este repo, esta vez dentro de la propia
-- migración que lo estaba arreglando.
--
-- Lo que NO entra aquí: gestionar la fila (sacar, mover, reordenar). Eso es la
-- 108, aparte, porque toca un ayudante compartido y dos casos de `puertas` que
-- hoy afirman lo contrario, y mezclarlo haría irreversible lo de aquí.

alter table turno_perfiles
  add column if not exists acepta_por_su_cuenta boolean not null default false;

comment on column turno_perfiles.acepta_por_su_cuenta is
  'Empleado: ¿puede traerse clientes por su cuenta (walk-in y llamar de la fila)? '
  'Nace en false; lo enciende quien manda en el local. En quien manda en su propia '
  'silla no se mira: ver turno_capta_por_su_cuenta.';

create or replace function public.turno_capta_por_su_cuenta(p_perfil uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.turno_manda_en_el_horario(p_perfil)
      or (public.turno_es_mi_perfil(p_perfil)
          and coalesce((select p.acepta_por_su_cuenta
                          from public.turno_perfiles p
                         where p.id = p_perfil), false));
$$;

revoke execute on function public.turno_capta_por_su_cuenta(uuid) from public, anon;
grant  execute on function public.turno_capta_por_su_cuenta(uuid) to authenticated;

-- ── 1. EL WALK-IN ───────────────────────────────────────────────────────────
-- Cuerpo tal cual está hoy en la base (advisory lock, guarda de "hay gente
-- esperando", alta del visitante y su membresía incluidos): lo ÚNICO que se
-- añade es el portero. Reconstruir una función de memoria en vez de copiarla
-- borra en silencio lo que no recuerdas.
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

  select count(*) into v_esperando
    from turno_cola q
   where q.negocio_id = p_negocio
     and q.estado in ('en_fila', 'llamado', 'en_camino')
     and (q.perfil_id is null or q.perfil_id = p_perfil);
  if v_esperando > 0 then
    raise exception 'hay % esperando: llama al siguiente, o marca ausente a quien no llegó', v_esperando;
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

-- ── 2. LLAMAR AL SIGUIENTE ──────────────────────────────────────────────────
-- Igual: cuerpo real (incluida la guarda de «tengo una cita encima ahora mismo»
-- y el `for update skip locked`), más el portero y el camino sin silla.
create or replace function public.turno_llamar_siguiente(
  p_negocio uuid, p_perfil uuid default null)
returns public.turno_cola
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    -- Sin silla concreta se está repartiendo el trabajo del local, y eso lo hace
    -- quien lo dirige. Sin esto, el portero de arriba se esquiva mandando null.
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
end $function$;

-- ── 3. CERRAR LA JORNADA: NO SE TOCA, Y AQUÍ ESTÁ POR QUÉ ──────────────────
-- La primera versión de esta migración también se la cerraba al empleado, por
-- simetría con `alargar_jornada`. Estaba mal, y lo dijo una prueba que llevaba
-- meses escrita con su razón dentro (migración 88):
--
--   'cerrar · el EMPLEADO sí puede cerrar su fila hoy (quita, no inventa)'
--   ...y si falla: 'si se va, se va: nadie le obliga a seguir recibiendo gente'
--
-- La regla nueva dice que el empleado no configura horario, y es cierto — pero
-- **alargar y cerrar no son la misma cosa**:
--
--   · ALARGAR crea disponibilidad. Es decidir que alguien trabaja más rato, y
--     eso lo decide quien dirige. Sigue cerrado (ya lo estaba).
--   · CERRAR quita la suya. Es irse. Si el empleado se pone malo y se va a las
--     tres, y no puede cerrar su fila, la gente sigue entrando a una cola que
--     no va a atender nadie. El daño es real y cae sobre el cliente.
--
-- Cerrar no puede crear trabajo para nadie ni cambiar las reglas del local, y
-- quien dirige lo deshace cuando quiera con `turno_jornada_normal`. Así que la
-- asimetría se queda, escrita: **alargar es poner horario; cerrar es irse.**

-- ── 4. LLAMAR A ALGUIEN CONCRETO ────────────────────────────────────────────
-- El mismo portero. Sin esto, lo de arriba no sirve de nada.
create or replace function public.turno_llamar_a(p_cola uuid)
returns public.turno_cola
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v public.turno_cola; v_sig uuid; v_ventana int;
begin
  v := public.turno_cola_operable(p_cola);
  if v.estado <> 'en_fila' then raise exception 'ese turno no está esperando'; end if;

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
end $function$;
