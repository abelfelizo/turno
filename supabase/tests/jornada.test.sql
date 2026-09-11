-- ─────────────────────────────────────────────────────────────────────────────
-- LA JORNADA DE HOY · Turno
--
-- Del piloto en el teléfono: «cuando la barbería cerró le di a sentar un
-- cliente, lo aceptó y luego lo cerró. Es normal que barberos decidan extender
-- su horario». Dos cosas distintas, y las dos se prueban aquí:
--
--   · QUE EL BARBERO PUEDA SENTAR A ALGUIEN CON EL LOCAL CERRADO NO ES UN FALLO
--     y esta suite lo fija como regla. La silla es suya y quien tiene delante se
--     corta, esté el letrero como esté. Lo que faltaba era decirlo en pantalla.
--   · ALARGAR EL DÍA (migración 87). El horario semanal es la norma, pero una
--     barbería cierra cuando se va el último. Antes, para seguir recibiendo
--     gente por la app después de la hora había que cambiar el horario del
--     martes PARA SIEMPRE, cosa que nadie hace a las nueve de la noche.
--
-- LO QUE MÁS IMPORTA COMPROBAR es que alargar NO TOCA el horario semanal. Si lo
-- machacara, la excepción de una noche se convertiría en la norma y al día
-- siguiente el barbero no sabría por qué su horario cambió solo.
--
-- El fixture monta a propósito una jornada QUE YA CERRÓ —de 00:01 a hace una
-- hora— para poder mirar el caso real a cualquier hora del día.
--
-- USO:  psql "$DATABASE_URL" -f supabase/tests/jornada.test.sql
-- ÉXITO: el mensaje termina en "TODO VERDE".
-- Todo pasa dentro de una transacción que SIEMPRE revierte (termina en RAISE).
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  a_due uuid := gen_random_uuid(); a_cli uuid := gen_random_uuid();
  u_due uuid; u_cli uuid; v_neg uuid; p_due uuid; s_corte uuid;
  -- El segundo local y sus dos personas, para la parte de "de quién es la
  -- jornada": hace falta un local de CADA modalidad para poder distinguirlas.
  a_emp uuid := gen_random_uuid(); a_due2 uuid := gen_random_uuid(); a_ren uuid := gen_random_uuid();
  u_due2 uuid; v_neg2 uuid; p_emp uuid; p_due2 uuid; p_ren uuid; v_cod2 text;
  v_cod text := 'JO-' || upper(substr(md5(random()::text),1,5));
  v_tz text := 'America/Santo_Domingo'; v_ahora timestamp; v_hoy date; v_dow int;
  n int := 0; ok int := 0; fallos text := ''; c text; r record;
  v_txt text; v_int int; v_ini time; v_fin time; v_uuid uuid; abiertas text := '';
begin
  v_ahora := (now() at time zone v_tz); v_hoy := v_ahora::date; v_dow := extract(dow from v_ahora);

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (a_due,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','jd_'||v_cod||'@t.test','',now(),now()),
         (a_cli,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','jc_'||v_cod||'@t.test','',now(),now());
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  perform turno_crear_negocio('Jornada Barber','empleados','DOP',true,'barbero','Duenno','809',
                              1, 10, 5, true, 1, 3, false, true);
  select id into u_due from turno_usuarios where auth_id = a_due;
  select id, negocio_id into p_due, v_neg from turno_perfiles where usuario_id = u_due limit 1;
  select codigo_acceso into v_cod from turno_negocios where id = v_neg;
  insert into turno_servicios (perfil_id,nombre,duracion_min,precio,activo)
  values (p_due,'Corte',30,500,true) returning id into s_corte;
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  perform turno_unirse_cliente(v_cod, 'Cliente Jornada', '829');
  select id into u_cli from turno_usuarios where auth_id = a_cli;
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);

  -- Una jornada QUE YA CERRÓ, sea la hora que sea cuando se corra esto.
  -- ON CONFLICT porque desde la migración 85 el perfil nace con jornada sembrada.
  insert into turno_horarios (perfil_id,dia_semana,hora_inicio,hora_fin,activo,tiempo_entre_clientes)
    select p_due, d, time '00:01', greatest(time '00:02', (v_ahora - interval '1 hour')::time), true, 0
      from generate_series(0,6) d
  on conflict (perfil_id, dia_semana) do update
    set hora_inicio = excluded.hora_inicio, hora_fin = excluded.hora_fin, activo = true;

  -- ══ EL LOCAL CERRADO ══════════════════════════════════════════════════════
  n:=n+1; c:='cerrado · el letrero lo dice';
  select turno_fila_abierta(p_due, v_neg) into v_txt;
  if v_txt like 'ahora está cerrado%' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - "'||coalesce(v_txt,'abierta')||'"'; end if;

  n:=n+1; c:='cerrado · el cliente NO puede entrar a la fila';
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  begin
    perform turno_entrar_a_cola(v_neg, s_corte, 'digital', p_due);
    fallos:=fallos||E'\n  x '||c||' - entró con el local cerrado';
  exception when others then ok:=ok+1; end;

  -- LA REGLA, FIJADA. Que el barbero pueda sentar a alguien con el local
  -- cerrado es deliberado desde la migración 70 y aquí queda por escrito: si
  -- algún día alguien "arregla" esto cerrándolo, este caso se pone rojo.
  n:=n+1; c:='cerrado · pero el barbero SÍ puede sentar a quien tiene delante';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  begin
    select * into r from turno_atender_sin_cita(v_neg, p_due, s_corte, 'De Paso', '');
    update turno_cola set estado='atendido', atendido_at=now() where id = r.id;
    ok:=ok+1;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  -- ══ ALARGAR ═══════════════════════════════════════════════════════════════
  n:=n+1; c:='alargar · devuelve una hora de cierre por delante de ahora';
  select turno_alargar_jornada(p_due, 60) into v_fin;
  if v_fin > v_ahora::time then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - dejó el cierre en '||coalesce(v_fin::text,'NULL'); end if;

  n:=n+1; c:='alargar · la fila vuelve a estar abierta';
  select turno_fila_abierta(p_due, v_neg) into v_txt;
  if v_txt is null then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - "'||v_txt||'"'; end if;

  n:=n+1; c:='alargar · y el cliente ya puede entrar';
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  begin
    select * into r from turno_entrar_a_cola(v_neg, s_corte, 'digital', p_due);
    ok:=ok+1;
    update turno_cola set estado='abandonado' where id = r.id;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  -- EL CASO QUE JUSTIFICA LA TABLA APARTE.
  n:=n+1; c:='alargar · NO toca el horario semanal';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  select hora_fin into v_fin from turno_horarios where perfil_id = p_due and dia_semana = v_dow;
  if v_fin <= v_ahora::time then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - el horario de siempre quedó en '||v_fin::text
       ||': la excepción de una noche se volvió la norma'; end if;

  n:=n+1; c:='alargar · no se aceptan barbaridades';
  begin
    perform turno_alargar_jornada(p_due, 600);
    fallos:=fallos||E'\n  x '||c||' - aceptó 10 horas';
  exception when others then ok:=ok+1; end;

  -- ══ CERRAR ANTES ══════════════════════════════════════════════════════════
  -- La otra mitad: alargar sin poder deshacerlo deja al barbero recibiendo
  -- gente hasta la hora que puso aunque se haya ido a su casa.
  n:=n+1; c:='cerrar · "ya cierro" apaga la fila al momento';
  perform turno_cerrar_jornada(p_due);
  select turno_fila_abierta(p_due, v_neg) into v_txt;
  if v_txt like 'ahora está cerrado%' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - "'||coalesce(v_txt,'sigue abierta')||'"'; end if;

  n:=n+1; c:='volver a la norma · se borra la excepción de hoy';
  perform turno_jornada_normal(p_due);
  select count(*) into v_int from turno_jornadas where perfil_id = p_due and fecha = v_hoy;
  if v_int = 0 then ok:=ok+1; else fallos:=fallos||E'\n  x '||c; end if;

  -- ══ ABRIR UN DÍA QUE LA NORMA TIENE CERRADO ═══════════════════════════════
  -- El domingo de diciembre. La excepción vale en las dos direcciones.
  n:=n+1; c:='abrir · un día cerrado en la norma se puede abrir solo hoy';
  update turno_horarios set activo = false where perfil_id = p_due and dia_semana = v_dow;
  insert into turno_jornadas (perfil_id, fecha, hora_inicio, hora_fin)
  values (p_due, v_hoy, time '00:01', time '23:59')
  on conflict (perfil_id, fecha) do update set hora_inicio = excluded.hora_inicio, hora_fin = excluded.hora_fin;
  select turno_fila_abierta(p_due, v_neg) into v_txt;
  if v_txt is null then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - "'||v_txt||'"'; end if;

  -- La fila y la agenda tienen que decir lo mismo: dejar una abierta y la otra
  -- cerrada es volver a tener dos relojes, que es lo que quitó la migración 78.
  n:=n+1; c:='abrir · y la agenda de hoy ofrece huecos otra vez';
  select count(*) into v_int from turno_slots_disponibles(p_due, v_hoy, s_corte) s;
  if v_int > 0 then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - 0 huecos con el día abierto a mano'; end if;

  -- ══ LAS PUERTAS ═══════════════════════════════════════════════════════════
  n:=n+1; c:='puerta · un cliente no puede alargarle la jornada al barbero';
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  begin
    perform turno_alargar_jornada(p_due, 60);
    fallos:=fallos||E'\n  x '||c||' - le movió el cierre a otro';
  exception when others then ok:=ok+1; end;

  n:=n+1; c:='puerta · ni cerrársela';
  begin
    perform turno_cerrar_jornada(p_due);
    fallos:=fallos||E'\n  x '||c||' - le cerró la fila a otro';
  exception when others then ok:=ok+1; end;

  -- LAS CUATRO, NO UNA. En la primera corrida esta comprobación solo miraba
  -- `alargar` y la red de puertas.test.sql encontró al instante lo que se me
  -- había escapado: turno_jornada_de le contestaba a un anónimo. No se escapaba
  -- gran cosa —las horas de una barbería están en la puerta de la calle— pero
  -- devolver algo y negarse se parecen mientras la consulta funcione, que es
  -- justo la lección de la migración 84.
  n:=n+1; c:='puerta · un anónimo no llega a ninguna de las cinco';
  perform set_config('request.jwt.claims', null, true);
  set local role anon;
  begin perform turno_alargar_jornada(p_due, 30); abiertas := abiertas||' alargar';    exception when others then null; end;
  begin perform turno_cerrar_jornada(p_due);      abiertas := abiertas||' cerrar';     exception when others then null; end;
  begin perform turno_jornada_normal(p_due);      abiertas := abiertas||' normal';     exception when others then null; end;
  begin perform turno_jornada_de(p_due, v_hoy);   abiertas := abiertas||' jornada_de'; exception when others then null; end;
  begin perform turno_adelantar_jornada(p_due, 30); abiertas := abiertas||' adelantar'; exception when others then null; end;
  reset role;
  if abiertas = '' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - abiertas:'||abiertas; end if;

  -- ══ DE QUIÉN ES LA JORNADA (migración 88) ═════════════════════════════════
  --
  -- La 87 dejó las tres funciones detrás de turno_perfil_operable —"mi silla o
  -- soy el dueño"— y esa es la puerta equivocada. Al lado de la regla que este
  -- repo ya tenía para los horarios (R11):
  --
  --   (es_mi_perfil AND autonomo) OR (perfil_admin AND NOT autonomo)
  --
  -- se colaban dos cosas: el dueño de un local de asientos alquilados podía
  -- moverle el cierre a quien le RENTA —cambiarle las horas a un negocio ajeno
  -- dentro de su propio local— y un empleado podía alargarse el día saltándose
  -- que en su local el horario lo pone la barbería.
  --
  -- PERO NO LAS DOS IGUAL. La doctrina de los bloqueos ya lo resuelve: «son del
  -- barbero en todos los casos: solo QUITAN disponibilidad, nunca la inventan».
  --
  --   · ALARGAR inventa: compromete a alguien a estar ahí → manda el horario.
  --   · CERRAR quita: es un bloqueo que dura lo que queda del día → es de quien
  --     opera la silla. Si el barbero se va, se va.
  --
  -- Hace falta un local de CADA tipo: con uno solo, la mitad de estos casos no
  -- se puede distinguir de la otra.
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (a_emp ,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','je_'||v_cod||'@t.test','',now(),now()),
         (a_due2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','j2_'||v_cod||'@t.test','',now(),now()),
         (a_ren ,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','jr_'||v_cod||'@t.test','',now(),now());

  -- El de arriba ya es un local de EMPLEADOS; le entra un empleado.
  perform set_config('request.jwt.claims', json_build_object('sub', a_emp::text)::text, true);
  select * into r from turno_unirse_profesional(v_cod,'barbero','empleado','Empleado','809');
  p_emp := r.id;
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  update turno_perfiles set aprobado = true where id = p_emp;

  -- Y uno de ASIENTOS ALQUILADOS aparte.
  perform set_config('request.jwt.claims', json_build_object('sub', a_due2::text)::text, true);
  perform turno_crear_negocio('Local Rentado','espacios_rentados','DOP',true,'barbero','Duenno2','809',
                              1, 10, 5, true, 1, 3, false, true);
  select id into u_due2 from turno_usuarios where auth_id = a_due2;
  select id, negocio_id into p_due2, v_neg2 from turno_perfiles where usuario_id = u_due2 limit 1;
  select codigo_acceso into v_cod2 from turno_negocios where id = v_neg2;
  perform set_config('request.jwt.claims', json_build_object('sub', a_ren::text)::text, true);
  select * into r from turno_unirse_profesional(v_cod2,'barbero','barbero_renta','Rentado','809');
  p_ren := r.id;
  perform set_config('request.jwt.claims', json_build_object('sub', a_due2::text)::text, true);
  update turno_perfiles set aprobado = true where id = p_ren;

  n:=n+1; c:='montaje · el empleado NO es autónomo y el rentado SÍ';
  if not turno_perfil_autonomo(p_emp) and turno_perfil_autonomo(p_ren) then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' (sin esto, lo de abajo no prueba nada)'; end if;

  n:=n+1; c:='alargar · el DUEÑO sí alarga a su empleado (en su local él pone el horario)';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  begin perform turno_alargar_jornada(p_emp, 30); ok:=ok+1;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  n:=n+1; c:='alargar · el EMPLEADO no se alarga el día solo';
  perform set_config('request.jwt.claims', json_build_object('sub', a_emp::text)::text, true);
  begin
    perform turno_alargar_jornada(p_emp, 30);
    fallos:=fallos||E'\n  x '||c||' - se saltó que el horario lo pone la barbería';
  exception when others then
    if sqlerrm like '%no lo decides tú%' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - se negó por otra razón: '||sqlerrm; end if;
  end;

  n:=n+1; c:='alargar · el RENTADO sí se alarga el suyo';
  perform set_config('request.jwt.claims', json_build_object('sub', a_ren::text)::text, true);
  begin perform turno_alargar_jornada(p_ren, 30); ok:=ok+1;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  -- EL CASO QUE MOTIVÓ LA MIGRACIÓN 88.
  n:=n+1; c:='alargar · el dueño NO le mueve las horas a quien le RENTA el asiento';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due2::text)::text, true);
  begin
    perform turno_alargar_jornada(p_ren, 30);
    fallos:=fallos||E'\n  x '||c||' - le cambió las horas a un negocio ajeno dentro de su local';
  exception when others then
    if sqlerrm like '%no lo decides tú%' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end if;
  end;

  n:=n+1; c:='cerrar · el EMPLEADO sí puede cerrar su fila hoy (quita, no inventa)';
  perform set_config('request.jwt.claims', json_build_object('sub', a_emp::text)::text, true);
  begin perform turno_cerrar_jornada(p_emp); ok:=ok+1;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm
       ||' (si se va, se va: nadie le obliga a seguir recibiendo gente)'; end;

  n:=n+1; c:='cerrar · y el RENTADO también la suya';
  perform set_config('request.jwt.claims', json_build_object('sub', a_ren::text)::text, true);
  begin perform turno_cerrar_jornada(p_ren); ok:=ok+1;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  n:=n+1; c:='cerrar · el dueño AJENO sigue sin poder tocar nada';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  begin
    perform turno_cerrar_jornada(p_ren);
    fallos:=fallos||E'\n  x '||c||' - cerró la fila de otro local';
  exception when others then ok:=ok+1; end;

  -- UNA REGLA QUE SOLO VALE POR LA FUNCIÓN NO ES UNA REGLA. La tabla lleva la
  -- misma política que turno_horarios, así que entrar por detrás tampoco cuela.
  n:=n+1; c:='RLS · el empleado no se escribe la jornada a mano saltándose la función';
  perform set_config('request.jwt.claims', json_build_object('sub', a_emp::text)::text, true);
  set local role authenticated;
  begin
    insert into turno_jornadas (perfil_id, fecha, hora_fin) values (p_emp, v_hoy + 1, time '23:59');
    reset role;
    fallos:=fallos||E'\n  x '||c||' - entró por la tabla lo que la función le negaba';
  exception when others then reset role; ok:=ok+1; end;

  n:=n+1; c:='RLS · el rentado SÍ escribe la suya';
  perform set_config('request.jwt.claims', json_build_object('sub', a_ren::text)::text, true);
  set local role authenticated;
  begin
    insert into turno_jornadas (perfil_id, fecha, hora_fin) values (p_ren, v_hoy + 1, time '23:59');
    reset role; ok:=ok+1;
  exception when others then reset role; fallos:=fallos||E'\n  x '||c||' - SE CERRÓ DE MÁS: '||sqlerrm; end;

  -- ═══ LA OTRA PUNTA DEL DÍA: HOY ABRO ANTES (migración 91) ═════════════════
  --
  -- La 87 dio "hoy cierro más tarde" y se olvidó de la mañana. Reportado desde
  -- el teléfono: «si abro a las 8am y quiero abrir a las 6am ese día no debería
  -- decir seguir abierto porque no sería una extensión sino un adelanto». Y no
  -- había cómo: alargar solo mueve hora_fin, y a las 6am eso no deja entrar a
  -- nadie AHORA.
  --
  -- Adelantar INVENTA disponibilidad igual que alargar —compromete a estar ahí
  -- antes de lo anunciado— así que va por la misma puerta: turno_manda_en_el_
  -- horario (R11). Los casos de abajo son los de alargar, en espejo.
  --
  -- Se limpia la jornada de hoy de los dos perfiles antes de empezar: los casos
  -- de arriba llamaron a turno_cerrar_jornada, que deja un hora_fin en el
  -- pasado, y con el cierre por delante de la apertura turno_jornada_de no
  -- devuelve nada. Sin esto estos casos rebotarían con "hoy no tienes jornada"
  -- y pasarían por la razón equivocada.
  delete from turno_jornadas where perfil_id in (p_emp, p_ren) and fecha = v_hoy;
  insert into turno_horarios (perfil_id,dia_semana,hora_inicio,hora_fin,activo,tiempo_entre_clientes)
  select pf, v_dow, time '23:00', time '23:59', true, 0 from (values (p_emp), (p_ren)) x(pf)
  on conflict (perfil_id, dia_semana) do update
    set hora_inicio = time '23:00', hora_fin = time '23:59', activo = true;

  n:=n+1; c:='adelantar · mueve la APERTURA y deja el cierre donde estaba';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  begin
    perform turno_adelantar_jornada(p_emp, 60);
    select j.hora_inicio, j.hora_fin into v_ini, v_fin from turno_jornada_de(p_emp, v_hoy) j;
    if v_ini = time '22:00' and v_fin = time '23:59' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - abre '||coalesce(v_ini::text,'?')
         ||' y cierra '||coalesce(v_fin::text,'?')||' (esperado 22:00 / 23:59)'; end if;
  exception when others then fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end;

  n:=n+1; c:='adelantar · el DUEÑO sí le abre antes a su empleado (R11)';
  begin perform turno_adelantar_jornada(p_emp, 30); ok:=ok+1;
  exception when others then fallos:=fallos||E'\n  x '||c||' - SE CERRÓ DE MÁS: '||sqlerrm; end;

  n:=n+1; c:='adelantar · el EMPLEADO no se abre el día por su cuenta (R11)';
  perform set_config('request.jwt.claims', json_build_object('sub', a_emp::text)::text, true);
  begin
    perform turno_adelantar_jornada(p_emp, 30);
    fallos:=fallos||E'\n  x '||c||' - se saltó que en su local el horario lo decide la barbería';
  exception when others then
    if sqlerrm like '%no lo decides tú%' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - rebotó con "'||sqlerrm||'", que no es la regla'; end if;
  end;

  n:=n+1; c:='adelantar · el RENTADO sí se abre la suya (R11)';
  perform set_config('request.jwt.claims', json_build_object('sub', a_ren::text)::text, true);
  begin perform turno_adelantar_jornada(p_ren, 60); ok:=ok+1;
  exception when others then fallos:=fallos||E'\n  x '||c||' - SE CERRÓ DE MÁS: '||sqlerrm; end;

  -- El espejo del caso de alargar, y la razón de que la 88 exista: moverle las
  -- horas a quien te RENTA el asiento es cambiarle el negocio a otro dentro de
  -- tu local.
  n:=n+1; c:='adelantar · el dueño de asientos NO le abre el día a quien le renta (R11)';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due2::text)::text, true);
  begin
    perform turno_adelantar_jornada(p_ren, 60);
    fallos:=fallos||E'\n  x '||c||' - le movió las horas a un negocio ajeno dentro de su local';
  exception when others then
    if sqlerrm like '%no lo decides tú%' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - rebotó con "'||sqlerrm||'", que no es la regla'; end if;
  end;

  n:=n+1; c:='adelantar · ni cinco minutos ni medio día';
  perform set_config('request.jwt.claims', json_build_object('sub', a_ren::text)::text, true);
  begin
    perform turno_adelantar_jornada(p_ren, 5);
    fallos:=fallos||E'\n  x '||c||' - aceptó 5 minutos';
  exception when others then
    if sqlerrm like '%entre 15 minutos y 4 horas%' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end if;
  end;

  -- Abrir un día que no trabajas no es adelantar: es cambiar el horario, y esa
  -- decisión se toma mirándola, no desde un botón de "hoy".
  n:=n+1; c:='adelantar · un día sin jornada no se abre desde aquí';
  update turno_horarios set activo = false where perfil_id = p_ren and dia_semana = v_dow;
  delete from turno_jornadas where perfil_id = p_ren and fecha = v_hoy;
  begin
    perform turno_adelantar_jornada(p_ren, 60);
    fallos:=fallos||E'\n  x '||c||' - abrió un día libre sin tocar el horario';
  exception when others then
    if sqlerrm like '%no tienes jornada%' then ok:=ok+1;
    else fallos:=fallos||E'\n  x '||c||' - '||sqlerrm; end if;
  end;

  -- ═══ LAS DOS HORAS EXTRA QUE EL CRON NO VEÍA (migración 100) ══════════════
  --
  -- Reportado desde el teléfono: «los clientes se están cancelando aún cuando
  -- se marcó 2 horas extra de trabajo. No funcionó.»
  --
  -- Y no funcionaba por la forma de fallo de siempre: dos sitios leyendo la
  -- misma regla por puertas distintas. La 87 escribe la extensión en
  -- `turno_jornadas` y NO toca `turno_horarios` —hay un caso arriba que lo
  -- fija—, pero turno_cerrar_olvidados hacía su propio join contra el horario
  -- SEMANAL. Resultado: el letrero decía abierto, la puerta dejaba entrar, y el
  -- cron iba expirando la fila por detrás cada minuto.
  --
  -- Los tres casos van juntos porque solos mienten: que no expire puede ser que
  -- el cron no corra, y que expire puede ser que la jornada sí terminó. Hace
  -- falta ver las dos direcciones Y que el cron no reviente sin sesión, que es
  -- la trampa de la migración 73.
  delete from turno_jornadas where perfil_id = p_due and fecha = v_hoy;
  update turno_horarios
     set activo = true, hora_inicio = time '00:01',
         hora_fin = greatest(time '00:02', (v_ahora - interval '1 hour')::time)
   where perfil_id = p_due and dia_semana = v_dow;

  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  perform turno_alargar_jornada(p_due, 120);
  perform set_config('request.jwt.claims', json_build_object('sub', a_cli::text)::text, true);
  select * into r from turno_entrar_a_cola(v_neg, s_corte, 'digital', p_due);
  v_uuid := r.id;

  n:=n+1; c:='extra · montaje: con dos horas extra el cliente SÍ entra';
  if v_uuid is not null then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' (sin esto, lo de abajo no prueba nada)'; end if;

  -- SIN SESIÓN, que es como corre el cron de verdad.
  perform set_config('request.jwt.claims', null, true);
  v_txt := 'NINGUNO';
  begin perform turno_cerrar_olvidados();
  exception when others then v_txt := sqlerrm; end;

  n:=n+1; c:='extra · el cron no revienta sin sesión (la trampa de la 73)';
  if v_txt = 'NINGUNO' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - '||v_txt; end if;

  n:=n+1; c:='extra · y NO cancela al que espera con la extensión puesta';
  select estado into v_txt from turno_cola where id = v_uuid;
  if v_txt = 'en_fila' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - quedó en "'||coalesce(v_txt,'?')
       ||'": el cron volvió a leer el horario semanal'; end if;

  -- LA OTRA MITAD. Un cron que no cierra nunca es tan roto como uno que cierra
  -- de más: los turnos olvidados se quedarían vivos para siempre.
  n:=n+1; c:='extra · pero cuando la jornada DE VERDAD termina, sí cierra';
  perform set_config('request.jwt.claims', json_build_object('sub', a_due::text)::text, true);
  update turno_jornadas set hora_fin = (v_ahora - interval '10 min')::time
   where perfil_id = p_due and fecha = v_hoy;
  perform set_config('request.jwt.claims', null, true);
  perform turno_cerrar_olvidados();
  select estado into v_txt from turno_cola where id = v_uuid;
  if v_txt = 'expirado' then ok:=ok+1;
  else fallos:=fallos||E'\n  x '||c||' - quedó en "'||coalesce(v_txt,'?')||'"'; end if;

  raise exception E'\n=== JORNADA DE HOY · % / % casos OK ===%',
    ok, n, case when fallos='' then E'\n  TODO VERDE' else fallos end;
end $$;
