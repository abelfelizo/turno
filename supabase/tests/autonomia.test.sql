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
  a_new uuid := gen_random_uuid(); u_new uuid; v_neg2 uuid; v_cod2 text;
  n int := 0; ok int := 0; fallos text := ''; c text; v_int int; v_rol text;
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

  -- ── RESULTADO (el RAISE revierte todos los fixtures) ──────────────────────
  raise exception E'\n═══ AUTONOMÍA · % / % casos OK ═══%',
    ok, n, case when fallos = '' then E'\n  TODO VERDE' else fallos end;
end $$;
