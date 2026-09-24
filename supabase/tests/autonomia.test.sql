-- ─────────────────────────────────────────────────────────────────────────────
-- PRUEBAS DE AUTONOMÍA · Turno
--
-- Regla de producto (sep-2026): el barbero decide sus servicios, precios y
-- horarios. La excepción es el EMPLEADO — ahí manda la barbería.
--
-- Esto NO se puede probar desde la app: la interfaz solo oculta botones, y
-- quien quiera saltárselo llama al API directamente. Lo que de verdad manda son
-- las políticas RLS, y por eso cada caso corre con `set local role
-- authenticated` suplantando a la persona. Sin eso las consultas van como
-- superusuario, RLS ni se evalúa, y la prueba pasaría siempre sin probar nada.
--
-- Igual que motor_cola.test.sql, termina en RAISE para revertir la transacción
-- entera. No deja ni un registro (la BD es compartida con otro proyecto).
--
-- USO:  psql "$DATABASE_URL" -f supabase/tests/autonomia.test.sql
-- Cubre también las REGLAS DE TIEMPO: quién puede ponerlas y de quién se
-- heredan cuando no hay excepción.
--
-- ÉXITO: el mensaje termina en "TODO VERDE".
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_neg uuid; -- upper(): turno_gen_codigo genera los códigos en mayúsculas y
  -- turno_unirse_profesional busca con upper(). Un fixture en minúsculas no
  -- encontraría nunca su propio local.
  v_cod text := 'AUT-' || upper(substr(md5(random()::text), 1, 4));
  a_due uuid := gen_random_uuid(); a_emp uuid := gen_random_uuid(); a_ren uuid := gen_random_uuid();
  u_due uuid; u_emp uuid; u_ren uuid;
  p_due uuid; p_emp uuid; p_ren uuid;
  a_new uuid := gen_random_uuid(); u_new uuid; v_neg2 uuid; v_cod2 text; p_new2 uuid; s_ren uuid;
  n int := 0; ok int := 0; fallos text := ''; c text; v_int int; v_rol text; v_bool boolean;
  v_txt text;
begin
  -- ── FIXTURES · un local con dueño-que-atiende, un empleado y un rentado ────
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (a_due,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ad_'||v_cod||'@turno.test','',now(),now()),
         (a_emp,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ae_'||v_cod||'@turno.test','',now(),now()),
         (a_ren,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ar_'||v_cod||'@turno.test','',now(),now());
  insert into turno_usuarios (nombre,telefono,tipo_usuario,auth_id) values ('Duenno','','profesional',a_due) returning id into u_due;
  insert into turno_usuarios (nombre,telefono,tipo_usuario,auth_id) values ('Empleado','','profesional',a_emp) returning id into u_emp;
  insert into turno_usuarios (nombre,telefono,tipo_usuario,auth_id) values ('Rentado','','profesional',a_ren) returning id into u_ren;
  insert into turno_negocios (nombre,tipo,codigo_acceso,moneda,activo) values ('Test Autonomia','empleados',v_cod,'DOP',true) returning id into v_neg;
  insert into turno_membresias (usuario_id,negocio_id,rol,activo) values
    (u_due,v_neg,'dueno',true),(u_emp,v_neg,'empleado',true),(u_ren,v_neg,'barbero_renta',true);
  insert into turno_perfiles (usuario_id,negocio_id,tipo_servicio,estado_actual,aprobado,activo)
    values (u_due,v_neg,'barbero','disponible',true,true) returning id into p_due;
  insert into turno_perfiles (usuario_id,negocio_id,tipo_servicio,estado_actual,aprobado,activo)
    values (u_emp,v_neg,'barbero','disponible',true,true) returning id into p_emp;
  insert into turno_perfiles (usuario_id,negocio_id,tipo_servicio,estado_actual,aprobado,activo)
    values (u_ren,v_neg,'barbero','disponible',true,true) returning id into p_ren;

  -- ── CASO 1 · quién es autónomo ────────────────────────────────────────────
  n:=n+1; c:='autonomia · el rentado y el dueño lo son, el empleado no';
  if turno_perfil_autonomo(p_ren) and turno_perfil_autonomo(p_due) and not turno_perfil_autonomo(p_emp)
    then ok:=ok+1; else fallos:=fallos||E'\n  x '||c; end if;

  -- ── CASO 2 · el empleado no se pone sus propios precios ───────────────────
  n:=n+1; c:='RLS · el empleado NO puede crearse un servicio';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_emp::text)::text, true);
    set local role authenticated;
    insert into turno_servicios (perfil_id,nombre,duracion_min,precio,activo) values (p_emp,'Corte propio',30,999,true);
    reset role;
    fallos := fallos || E'\n  x '||c||' - lo consiguio';
  exception when others then reset role; ok:=ok+1;
  end;

  -- ── CASO 3 · pero el dueño sí ─────────────────────────────────────────────
  -- Antes de la migración 37 esto FALLABA: la política solo miraba
  -- turno_es_mi_perfil, así que el local no podía poner precios a su gente.
  n:=n+1; c:='RLS · el dueño SI puede ponerle servicio a su empleado';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
    set local role authenticated;
    insert into turno_servicios (perfil_id,nombre,duracion_min,precio,activo) values (p_emp,'Corte del local',30,500,true);
    reset role;
    ok:=ok+1;
  exception when others then reset role; fallos := fallos || E'\n  x '||c||' - '||sqlerrm;
  end;

  -- ── CASO 4 · el rentado sigue mandando en lo suyo ─────────────────────────
  n:=n+1; c:='RLS · el rentado SI puede crearse su servicio';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_ren::text)::text, true);
    set local role authenticated;
    insert into turno_servicios (perfil_id,nombre,duracion_min,precio,activo) values (p_ren,'Corte propio',30,700,true);
    reset role;
    ok:=ok+1;
  exception when others then reset role; fallos := fallos || E'\n  x '||c||' - '||sqlerrm;
  end;

  -- ── CASO 5 · la jornada del empleado la fija el local ─────────────────────
  --
  -- EL DOMINGO A PROPÓSITO. Desde la migración 85 el perfil nace con una jornada
  -- sembrada de lunes a sábado, y un INSERT sobre el lunes chocaría con el
  -- índice único (perfil_id, dia_semana). El caso seguiría en verde —también
  -- lanza— pero por una razón que no tiene nada que ver con los permisos: la
  -- peor forma de pasar. El domingo está libre, así que lo único que puede
  -- pararlo es RLS, que es lo que se mide.
  n:=n+1; c:='RLS · el empleado NO puede cambiarse el horario';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_emp::text)::text, true);
    set local role authenticated;
    insert into turno_horarios (perfil_id,dia_semana,hora_inicio,hora_fin,activo,tiempo_entre_clientes)
      values (p_emp,0,time '06:00',time '09:00',true,10);
    reset role;
    fallos := fallos || E'\n  x '||c||' - lo consiguio';
  exception when unique_violation then reset role;
              fallos := fallos || E'\n  x '||c||' - chocó con el índice único, NO con RLS: el caso no probaba nada';
            when others then reset role; ok:=ok+1;
  end;

  -- ── CASO 6 · pero el almuerzo es suyo ─────────────────────────────────────
  -- Bloquear es operativo, no una decisión de negocio, y solo QUITA
  -- disponibilidad. Un barbero que no puede marcar que sale a comer acaba
  -- teniendo citas encima del almuerzo, y eso rompe el local, no lo ordena.
  n:=n+1; c:='RLS · el empleado SI puede bloquear una hora (almuerzo)';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_emp::text)::text, true);
    set local role authenticated;
    insert into turno_bloqueos (perfil_id,fecha,hora_inicio,hora_fin,motivo)
      values (p_emp,current_date,time '12:00',time '13:00','Almuerzo');
    reset role;
    ok:=ok+1;
  exception when others then reset role; fallos := fallos || E'\n  x '||c||' - '||sqlerrm;
  end;

  -- ── CASO 7 · autónomo no significa manga ancha ────────────────────────────
  n:=n+1; c:='RLS · el rentado NO puede tocar el servicio de otro';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_ren::text)::text, true);
    set local role authenticated;
    update turno_servicios set precio = 1 where perfil_id = p_emp;
    get diagnostics v_int = row_count;
    reset role;
    if v_int = 0 then ok:=ok+1; else fallos := fallos || E'\n  x '||c||' - cambio '||v_int||' filas'; end if;
  exception when others then reset role; ok:=ok+1;
  end;

  -- ── FIXTURES 2 · un local de la otra modalidad y un barbero nuevo ─────────
  v_cod2 := 'REN-' || upper(substr(md5(random()::text), 1, 4));
  insert into turno_negocios (nombre,tipo,codigo_acceso,moneda,activo)
    values ('Test Rentados','espacios_rentados',v_cod2,'DOP',true) returning id into v_neg2;
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (a_new,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','an_'||v_cod||'@turno.test','',now(),now());
  insert into turno_usuarios (nombre,telefono,tipo_usuario,auth_id) values ('Nuevo','','profesional',a_new) returning id into u_new;

  -- ── CASO 8 · el local de empleados impone su modalidad ────────────────────
  -- Antes de la migración 38 el rol llegaba desde el cliente: bastaba con pedir
  -- 'barbero_renta' para entrar como autónomo a un local donde manda el dueño.
  n:=n+1; c:='alta · pedir renta en un local de empleados NO cuela';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_new::text)::text, true);
    perform turno_unirse_profesional(v_cod, 'barbero', 'barbero_renta', 'Nuevo', '');
    select rol into v_rol from turno_membresias
     where usuario_id = u_new and negocio_id = v_neg and rol in ('empleado','barbero_renta');
    if v_rol = 'empleado' then ok:=ok+1;
    else fallos := fallos || E'\n  x '||c||' - quedo como '||coalesce(v_rol,'NULL'); end if;
  exception when others then fallos := fallos || E'\n  x '||c||' - excepcion: '||sqlerrm;
  end;

  -- ── CASO 9 · y el de asientos alquilados también ──────────────────────────
  n:=n+1; c:='alta · pedir empleado en un local de asientos NO cuela';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_new::text)::text, true);
    perform turno_unirse_profesional(v_cod2, 'barbero', 'empleado', 'Nuevo', '');
    select rol into v_rol from turno_membresias
     where usuario_id = u_new and negocio_id = v_neg2 and rol in ('empleado','barbero_renta');
    if v_rol = 'barbero_renta' then ok:=ok+1;
    else fallos := fallos || E'\n  x '||c||' - quedo como '||coalesce(v_rol,'NULL'); end if;
  exception when others then fallos := fallos || E'\n  x '||c||' - excepcion: '||sqlerrm;
  end;

  -- ── QUIÉN DEJA ENTRAR A QUIÉN (migración 94, CORREGIDA POR LA 110) ────────
  -- Este caso estuvo VERDE y OBSOLETO. La 94 razonaba que la aprobación va con
  -- el mismo interruptor que el mando —«quien no dirige, tampoco autoriza»— y
  -- por eso en asientos alquilados el barbero entraba activo, agregándose él
  -- solo. El dueño del producto lo corrigió: «barbero y barbería se pueden
  -- agregar mutuamente, pero requiere aprobación del otro».
  --
  -- Y tenía razón, porque el razonamiento de la 94 confundía dos cosas:
  -- **decidir quién entra en tu casa no es dirigir a nadie**. El casero sigue
  -- sin poner precios, horarios ni reglas (92) y sin ver un peso de lo que
  -- factura su inquilino (97). Pero el código del local se comparte por
  -- WhatsApp, y con la 94 eso bastaba para aparecer en su escaparate.
  --
  -- Se deja escrito porque es la lección que no se ve en un CI verde: **una
  -- prueba en verde solo garantiza que el código hace lo que la prueba dice, no
  -- que la prueba siga diciendo lo que el producto quiere.**
  n:=n+1; c:='alta · en ASIENTOS ALQUILADOS tampoco entra solo: falta el sí del local';
  select aprobado, pendiente_de into v_bool, v_txt from turno_perfiles
   where usuario_id = u_new and negocio_id = v_neg2;
  if v_bool = false and v_txt = 'local' then ok:=ok+1;
  else fallos := fallos || E'\n  x '||c||' - aprobado='||coalesce(v_bool::text,'NULL')
       ||', pendiente_de='||coalesce(v_txt,'NULL')
       ||': con el código del local, que va por WhatsApp, cualquiera entra al escaparate'; end if;

  n:=n+1; c:='alta · en EMPLEADOS entra pendiente: solo el dueño lo mete';
  select aprobado into v_bool from turno_perfiles
   where usuario_id = u_new and negocio_id = v_neg;
  if v_bool = false then ok:=ok+1;
  else fallos := fallos || E'\n  x '||c||' - entró aprobado sin que el dueño lo aprobara'; end if;

  -- ── CASO 10 · el local mixto lo decide el dueño ───────────────────────────
  n:=n+1; c:='mixto · el dueño SI puede pasar a un empleado a renta';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
    perform turno_cambiar_modalidad(p_emp, 'barbero_renta');
    if turno_perfil_autonomo(p_emp) then ok:=ok+1;
    else fallos := fallos || E'\n  x '||c||' - siguio sin ser autonomo'; end if;
    perform turno_cambiar_modalidad(p_emp, 'empleado');   -- se deja como estaba
  exception when others then fallos := fallos || E'\n  x '||c||' - excepcion: '||sqlerrm;
  end;

  -- LA VUELTA, que hasta ahora se hacía y no se miraba: en un local de EMPLEADOS
  -- el dueño sí puede deshacerlo. Va escrito porque la migración 98 cierra esta
  -- misma llamada en la otra modalidad, y cerrarla en las dos dejaría al local
  -- mixto sin salida.
  --
  -- Se le pasa a renta PRIMERO a propósito: el caso de arriba ya lo dejó como
  -- empleado, y un update que no cambia ninguna fila pondría esto en verde
  -- aunque la función no hiciera nada.
  n:=n+1; c:='mixto · y en un local de EMPLEADOS puede deshacerlo';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
    perform turno_cambiar_modalidad(p_emp, 'barbero_renta');
    perform turno_cambiar_modalidad(p_emp, 'empleado');
    if not turno_perfil_autonomo(p_emp) then ok:=ok+1;
    else fallos := fallos || E'\n  x '||c||' - SE CERRÓ DE MÁS: se quedó autónomo'; end if;
  exception when others then fallos := fallos || E'\n  x '||c||' - SE CERRÓ DE MÁS: '||sqlerrm;
  end;

  -- ═══ EL CASERO NO SE NOMBRA JEFE (migración 98) ═══════════════════════════
  --
  -- Las migraciones 92, 93 y 94 le quitaron al dueño de un local de alquiler el
  -- mando, el cobro y la aprobación sobre su inquilino. Quedaba abierta la
  -- puerta que las abre todas de golpe: pasarlo a 'empleado'. Con eso
  -- turno_perfil_autonomo pasa a false, turno_manda_en_la_silla pasa a true, y
  -- el dueño recupera de una vez todo lo que la 92 le había quitado — sin
  -- saltarse ningún portero y sin pagar nada, porque turno_silla_al_dia mira el
  -- TIPO DEL LOCAL y le sigue cobrando al inquilino.
  --
  -- FIXTURE: v_neg2 es de asientos alquilados y u_new entró ahí como
  -- barbero_renta, pero se creó con un insert pelado y NO TIENE DUEÑO. Sin
  -- membresía de dueño la llamada rebotaría con 'no autorizado' y el caso
  -- pasaría por la razón equivocada — un portero se prueba con la puerta que de
  -- verdad existe.
  insert into turno_membresias (usuario_id, negocio_id, rol, activo)
    values (u_due, v_neg2, 'dueno', true);
  select id into p_new2 from turno_perfiles
   where usuario_id = u_new and negocio_id = v_neg2;

  n:=n+1; c:='casero · montaje: es admin del local de alquiler (si no, no prueba nada)';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  if p_new2 is not null and v_neg2 in (select turno_negocios_admin()) then ok:=ok+1;
  else fallos := fallos || E'\n  x '||c; end if;

  n:=n+1; c:='casero · en un local de ALQUILER no puede nombrar EMPLEADO a nadie';
  begin
    perform turno_cambiar_modalidad(p_new2, 'empleado');
    fallos := fallos || E'\n  x '||c
      ||' - se nombró jefe de su inquilino, y gratis: le dirige la silla sin aportar nada';
  exception when others then
    if sqlerrm like '%alquilas asientos%' then ok:=ok+1;
    else fallos := fallos || E'\n  x '||c||' - rebotó con "'||sqlerrm||'", que no es la regla'; end if;
  end;

  n:=n+1; c:='casero · y el inquilino sigue siendo autónomo, con su silla fuera de su alcance';
  if turno_perfil_autonomo(p_new2) and not turno_manda_en_la_silla(p_new2) then ok:=ok+1;
  else fallos := fallos || E'\n  x '||c||' - autónomo='
       ||coalesce(turno_perfil_autonomo(p_new2)::text,'?')||' manda='
       ||coalesce(turno_manda_en_la_silla(p_new2)::text,'?'); end if;

  -- ── CASO 11 · pero el barbero no se la concede a sí mismo ─────────────────
  n:=n+1; c:='mixto · el barbero NO puede cambiarse la modalidad';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_emp::text)::text, true);
    perform turno_cambiar_modalidad(p_emp, 'barbero_renta');
    fallos := fallos || E'\n  x '||c||' - se ascendio solo';
  exception when others then
    if sqlerrm like '%no autorizado%' then ok:=ok+1;
    else fallos := fallos || E'\n  x '||c||' - error inesperado: '||sqlerrm; end if;
  end;

  -- ── REGLAS DE TIEMPO · el rentado pone las suyas ──────────────────────────
  -- El local pide 3 h de antelación; el que paga su asiento no tiene por qué
  -- seguirlas.
  insert into turno_configuracion_negocio (negocio_id, anticipacion_minima_horas, ventana_llegada_min, gracia_cita_min, umbral_confirmacion)
    values (v_neg, 3, 10, 5, 2)
    on conflict (negocio_id) do update set anticipacion_minima_horas = 3, ventana_llegada_min = 10;

  n:=n+1; c:='tiempos · sin excepción hereda del local (3 h)';
  if turno_regla_tiempo(p_ren, v_neg, 'anticipacion_minima_horas') = 3 then ok:=ok+1;
  else fallos := fallos || E'\n  x '||c; end if;

  n:=n+1; c:='tiempos · el rentado SI puede poner los suyos';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_ren::text)::text, true);
    perform turno_guardar_reglas_barbero(p_ren, 1, 20, 15, 4);
    if turno_regla_tiempo(p_ren, v_neg, 'anticipacion_minima_horas') = 1
       and turno_regla_tiempo(p_ren, v_neg, 'ventana_llegada_min') = 20 then ok:=ok+1;
    else fallos := fallos || E'\n  x '||c||' - la suya no ganó'; end if;
  exception when others then fallos := fallos || E'\n  x '||c||' - '||sqlerrm;
  end;

  n:=n+1; c:='tiempos · el empleado NO puede poner los suyos';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_emp::text)::text, true);
    perform turno_guardar_reglas_barbero(p_emp, 1, 20, 15, 4);
    fallos := fallos || E'\n  x '||c||' - lo consiguio';
  exception when others then
    if sqlerrm like '%las pone la barbería%' then ok:=ok+1;
    else fallos := fallos || E'\n  x '||c||' - error inesperado: '||sqlerrm; end if;
  end;

  -- La autonomía se comprueba al LEER, no al escribir: si un empleado acaba
  -- con un valor guardado (por una migración, por un cambio de modalidad),
  -- sigue mandando el local. Escribir bien no basta si leer se fía.
  n:=n+1; c:='tiempos · un empleado con valor guardado igual hereda';
  update turno_perfiles set anticipacion_minima_horas = 99 where id = p_emp;
  if turno_regla_tiempo(p_emp, v_neg, 'anticipacion_minima_horas') = 3 then ok:=ok+1;
  else fallos := fallos || E'\n  x '||c||' - dio '||turno_regla_tiempo(p_emp, v_neg, 'anticipacion_minima_horas'); end if;

  n:=n+1; c:='tiempos · volver a null vuelve a heredar';
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', a_ren::text)::text, true);
    perform turno_guardar_reglas_barbero(p_ren, null, null, null, null);
    if turno_regla_tiempo(p_ren, v_neg, 'anticipacion_minima_horas') = 3 then ok:=ok+1;
    else fallos := fallos || E'\n  x '||c; end if;
  exception when others then fallos := fallos || E'\n  x '||c||' - '||sqlerrm;
  end;

  -- ═══ EL CASERO NO ES EL JEFE (migración 92) ═══════════════════════════════
  --
  -- R11 decía quién pone los precios y los horarios. Faltaba el resto del
  -- poder, que iba por turno_perfil_operable —«mi silla, O soy el dueño del
  -- local»— sin mirar la modalidad. Con eso, el dueño podía sobre la silla de
  -- alguien que le PAGA RENTA: llamarle clientes, sentarle gente, levantarle al
  -- que tuviera en la silla, cerrarle la jornada, leerle la cartera CON
  -- TELÉFONOS y leerle la facturación. Eso no es agrupar, es dirigir.
  --
  -- La regla nueva tiene la misma forma que turno_manda_en_el_horario, para que
  -- las dos se lean igual:  es mía  OR  (soy el dueño  AND  no es autónomo).
  --
  -- OJO CON EL FIXTURE: p_ren es 'barbero_renta' DENTRO de un local de
  -- empleados, que es el caso mixto y el más exigente — si la regla mirase el
  -- tipo del local en vez de la autonomía de la persona, estos casos pasarían
  -- por la razón equivocada.

  n:=n+1; c:='casero · el dueño SÍ opera la silla de su EMPLEADO';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  if turno_perfil_operable(p_emp) then ok:=ok+1;
  else fallos := fallos || E'\n  x '||c||' - SE CERRÓ DE MÁS'; end if;

  n:=n+1; c:='casero · y SÍ le lee la cartera';
  begin
    perform turno_clientes_por_recuperar(p_emp); ok:=ok+1;
  exception when others then fallos := fallos || E'\n  x '||c||' - SE CERRÓ DE MÁS: '||sqlerrm; end;

  n:=n+1; c:='casero · pero NO opera la silla de quien le RENTA';
  if not turno_perfil_operable(p_ren) then ok:=ok+1;
  else fallos := fallos || E'\n  x '||c||' - le sigue manejando la silla a su inquilino'; end if;

  n:=n+1; c:='casero · ni le lee la cartera con teléfonos';
  begin
    perform turno_clientes_por_recuperar(p_ren);
    fallos := fallos || E'\n  x '||c||' - se llevó los clientes de su inquilino';
  exception when others then ok:=ok+1; end;

  n:=n+1; c:='casero · ni le lee la facturación';
  begin
    perform turno_stats_periodo_perfil(p_ren, current_date - 3650, current_date);
    fallos := fallos || E'\n  x '||c||' - se llevó las cuentas de su inquilino';
  exception when others then ok:=ok+1; end;

  -- ── NI LE TOCA LA AGENDA (migración 111) ──────────────────────────────────
  -- La tercera vez que esta misma regla aparecía a medio arreglar. La 92 la
  -- puso en las funciones, la 101 en las políticas de cola, citas e historial,
  -- y `turno_bloqueos_write` se quedó con la versión de antes:
  -- «es mía O soy el dueño del local», sin mirar la modalidad. Con eso el
  -- casero le metía un bloqueo de 9 a 6 al inquilino y le apagaba el día — que
  -- es justo lo que la 92 dice que no es un alquiler.
  --
  -- El bloqueo se crea AQUÍ FUERA de cualquier bloque con `exception`: uno que
  -- captura revierte sus propias sentencias, y el fixture desaparecería.
  perform set_config('request.jwt.claims', json_build_object('sub', a_new::text)::text, true);
  insert into turno_bloqueos (perfil_id, fecha, hora_inicio, hora_fin, motivo)
  values (p_new2, current_date + 1, time '12:00', time '13:00', 'asunto personal mio');

  n:=n+1; c:='casero · no le lee el MOTIVO del bloqueo a su inquilino';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  set local role authenticated;
  select count(*) into v_int from turno_bloqueos where perfil_id = p_new2;
  reset role;
  if v_int = 0 then ok:=ok+1;
  else fallos := fallos || E'\n  x '||c||' - leyó '||v_int
       ||': el motivo lo escribe el barbero a mano y es suyo'; end if;

  n:=n+1; c:='casero · ni le CIERRA EL DÍA con un bloqueo de 9 a 6';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  set local role authenticated;
  begin
    insert into turno_bloqueos (perfil_id, fecha, hora_inicio, hora_fin, motivo)
    values (p_new2, current_date + 2, time '09:00', time '18:00', 'te cierro el dia');
    v_int := 1;
  exception when others then v_int := 0; end;
  reset role;
  if v_int = 0 then ok:=ok+1;
  else fallos := fallos || E'\n  x '||c
       ||' - le apagó el negocio a quien solo le renta una silla'; end if;

  n:=n+1; c:='casero · pero el inquilino SÍ ve y escribe los suyos (no cerrar de más)';
  perform set_config('request.jwt.claims', json_build_object('sub', a_new::text)::text, true);
  set local role authenticated;
  select count(*) into v_int from turno_bloqueos where perfil_id = p_new2;
  begin
    insert into turno_bloqueos (perfil_id, fecha, hora_inicio, hora_fin, motivo)
    values (p_new2, current_date + 3, time '15:00', time '16:00', 'mio');
    v_int := v_int + 10;
  exception when others then null; end;
  reset role;
  if v_int = 11 then ok:=ok+1;
  else fallos := fallos || E'\n  x '||c||' - SE CERRÓ DE MÁS ('||v_int||')'; end if;

  n:=n+1; c:='bloqueo · y al EMPLEADO su jefe SÍ le maneja la agenda';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  set local role authenticated;
  begin
    insert into turno_bloqueos (perfil_id, fecha, hora_inicio, hora_fin, motivo)
    values (p_emp, current_date + 2, time '09:00', time '10:00', 'reunion del local');
    v_int := 1;
  exception when others then v_int := 0; v_txt := sqlerrm; end;
  reset role;
  if v_int = 1 then ok:=ok+1;
  else fallos := fallos || E'\n  x '||c||' - SE CERRÓ DE MÁS: '||coalesce(v_txt,'?')
       ||' (dirigir a su empleado es justo lo que sí puede)'; end if;

  -- NI POR LA TABLA (migración 101). El caso de arriba cerró la FUNCIÓN y la
  -- tabla se quedó abierta un mes entero: con `set local role authenticated`, un
  -- simple `select sum(precio_cobrado)` le daba al casero la facturación de su
  -- inquilino. Es el fallo número uno de este repo —una regla que solo vive en
  -- la función no es una regla— por quinta vez, y esta vez sin siquiera
  -- necesitar una SECURITY DEFINER de por medio.
  --
  -- La visita se inserta AQUÍ, fuera de todo bloque con exception: uno que
  -- captura revierte sus propios inserts y el caso mediría una tabla vacía.
  -- `servicio_id` es NOT NULL, así que se coge el servicio que el rentado se
  -- creó en el caso 4 — y ese caso pasó, o sea que existe.
  select id into s_ren from turno_servicios where perfil_id = p_ren limit 1;
  insert into turno_historial_visitas (cliente_id, negocio_id, perfil_id, servicio_id, fecha, precio_cobrado, origen)
  values (u_new, v_neg, p_ren, s_ren, current_date, 1500, 'cola_digital');

  n:=n+1; c:='casero · ni por la TABLA, que es por donde se entraba de verdad';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  set local role authenticated;
  select count(*) into v_int from turno_historial_visitas where perfil_id = p_ren;
  reset role;
  if v_int = 0 then ok:=ok+1;
  else fallos := fallos || E'\n  x '||c||' - leyó '||v_int
       ||' visitas con su precio saltándose la función'; end if;

  n:=n+1; c:='casero · y el inquilino SÍ lee lo suyo (no cerrar de más)';
  perform set_config('request.jwt.claims', json_build_object('sub', a_ren::text)::text, true);
  set local role authenticated;
  select count(*) into v_int from turno_historial_visitas where perfil_id = p_ren;
  reset role;
  if v_int = 1 then ok:=ok+1;
  else fallos := fallos || E'\n  x '||c||' - vio '||v_int||' de 1: SE CERRÓ DE MÁS'; end if;

  -- La otra mitad: cerrar de más sería dejar al inquilino sin su propia silla.
  n:=n+1; c:='casero · el rentado SÍ opera lo suyo';
  perform set_config('request.jwt.claims', json_build_object('sub', a_ren::text)::text, true);
  if turno_perfil_operable(p_ren) then ok:=ok+1;
  else fallos := fallos || E'\n  x '||c||' - SE CERRÓ DE MÁS: se quedó sin su propia silla'; end if;

  -- ── SUSPENDER YA NO ES UN INTERRUPTOR DE APAGADO ──────────────────────────
  -- «Si el dueño decide suspenderlo, el barbero podría seguir operando con su
  -- app.» Exacto, y eso es lo que debe pasar: si pudiera apagarle la app no
  -- sería su casero, sería su jefe. Lo que el dueño controla es el acceso a lo
  -- que es DEL LOCAL — la fila y la fachada—, no el trabajo del otro.
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  perform turno_suspender_barbero(p_ren, true, 'no pagó la renta');

  n:=n+1; c:='suspender · al rentado lo saca de la fachada del local';
  if turno_fila_abierta(p_ren, v_neg) = 'no pagó la renta' then ok:=ok+1;
  else fallos := fallos || E'\n  x '||c||' - el letrero dice "'
       ||coalesce(turno_fila_abierta(p_ren, v_neg),'abierta')||'"'; end if;

  -- LA MITAD NUEVA, Y LA QUE IMPORTA.
  n:=n+1; c:='suspender · pero NO le apaga la silla: sigue atendiendo a quien tiene delante';
  perform set_config('request.jwt.claims', json_build_object('sub', a_ren::text)::text, true);
  if turno_perfil_operable(p_ren) then ok:=ok+1;
  else fallos := fallos || E'\n  x '||c
       ||' - el casero le apagó el negocio, no solo la fila del local'; end if;

  -- Y al empleado sí se le para del todo: eso sí es de su patrón.
  n:=n+1; c:='suspender · al EMPLEADO sí se le para del todo';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  perform turno_suspender_barbero(p_emp, true, 'suspendido');
  perform set_config('request.jwt.claims', json_build_object('sub', a_emp::text)::text, true);
  if not turno_perfil_operable(p_emp) then ok:=ok+1;
  else fallos := fallos || E'\n  x '||c||' - siguió operable suspendido'; end if;

  -- ── RESULTADO (el RAISE revierte todos los fixtures) ──────────────────────
  raise exception E'\n═══ AUTONOMÍA · % / % casos OK ═══%',
    ok, n, case when fallos = '' then E'\n  TODO VERDE' else fallos end;
end $$;
