-- ─────────────────────────────────────────────────────────────────────────────
-- PUERTA DE PRUEBAS · el reparto completo, ya montado
--
-- TEMPORAL. Existe para no perder media hora creando correos cada vez que hay
-- que mirar cómo se ve la app desde otro rol. Se borra con `puerta_de_pruebas_
-- desmontar.sql` cuando el onboarding esté como debe ser.
--
-- ── ESTO NO ES UN BACKDOOR ──────────────────────────────────────────────────
-- Y la diferencia importa, porque en este proyecto ya se cerró uno (tarea 2).
-- Aquí NO se salta nada:
--
--   · Son CUENTAS DE VERDAD, con su contraseña de verdad. La pantalla llama a
--     `signInWithPassword` como lo haría cualquiera.
--   · Por tanto `auth.uid()` es real, y RLS y todos los porteros del servidor
--     se aplican exactamente igual que a un usuario normal. Lo que se prueba es
--     el comportamiento real, no una imitación.
--   · Lo único que ahorra es teclear el correo y esperar el código.
--
-- Si esta pantalla se colara en producción, lo peor que podría hacer un extraño
-- es entrar a una barbería de mentira. No le da acceso a nada de nadie.
--
-- ── LA BASE ES COMPARTIDA ───────────────────────────────────────────────────
-- `auth.users` la comparte este proyecto con otro que está en producción (ahí
-- están `prestamistas` y `cartera_colaboradores`). Por eso:
--
--   · Todos los correos acaban en `@turno.test`, que no es un dominio real y no
--     puede recibir nada.
--   · Todos los ids empiezan por `a0000000-`, para poder encontrarlos y
--     borrarlos sin tocar a nadie más.
--   · El desmontaje borra en orden: primero los negocios, después los usuarios
--     de Turno y al final las cuentas. `turno_usuarios.auth_id` es ON DELETE
--     SET NULL, así que borrar la cuenta primero dejaría una fila huérfana.
--
-- ── EL REPARTO ──────────────────────────────────────────────────────────────
-- Contraseña para todas: Turno.Pruebas.2026
--
--   LOCAL «Prueba Empleados» (código PRU-EMPL)
--     admin-empleados@turno.test   administra y atiende
--     empleado@turno.test          empleado PASIVO — la barbería le da el trabajo
--     empleado-activo@turno.test   empleado CON permiso de servirse de la fila
--     manicurista@turno.test       otro oficio, para el doble servicio
--
--   LOCAL «Prueba Alquiler» (código PRU-RENT)
--     admin-alquiler@turno.test    casero que NO atiende: ve visitas, no dinero
--     rentado@turno.test           paga su asiento, manda en su silla
--
--   POR SU CUENTA
--     independiente@turno.test     su propio espacio (código PRU-SOLO)
--     dos-sitios@turno.test        empleado en Prueba Empleados Y espacio propio
--                                  — el caso que destapó toda la conversación
--
--   CLIENTES
--     cliente@turno.test           miembro de LOS DOS locales
--     cliente-b@turno.test         solo de Prueba Alquiler
--
-- USO:  pegar entero en el editor SQL de Supabase. Se puede repetir: lo primero
--       que hace es desmontar lo anterior.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_pass text := 'Turno.Pruebas.2026';
  r record;
  v_neg_emp uuid; v_neg_ren uuid; v_neg_solo uuid; v_neg_dos uuid;
  p_admin uuid; p_emp uuid; p_empa uuid; p_mani uuid; p_ren uuid; p_solo uuid;
  p_dos_emp uuid; p_dos_solo uuid;
  v_cod text; v_perfil record;
  -- El reparto, en una tabla para no repetir diez veces lo mismo.
  v_gente constant jsonb := '[
    {"id":"a0000000-0000-4000-8000-000000000001","email":"admin-empleados@turno.test","nombre":"Ana Admin"},
    {"id":"a0000000-0000-4000-8000-000000000002","email":"empleado@turno.test","nombre":"Beto Empleado"},
    {"id":"a0000000-0000-4000-8000-000000000003","email":"empleado-activo@turno.test","nombre":"Caro Activa"},
    {"id":"a0000000-0000-4000-8000-000000000004","email":"manicurista@turno.test","nombre":"Dana Uñas"},
    {"id":"a0000000-0000-4000-8000-000000000005","email":"cliente@turno.test","nombre":"Eli Cliente"},
    {"id":"a0000000-0000-4000-8000-000000000006","email":"admin-alquiler@turno.test","nombre":"Fabio Casero"},
    {"id":"a0000000-0000-4000-8000-000000000007","email":"rentado@turno.test","nombre":"Gabo Rentado"},
    {"id":"a0000000-0000-4000-8000-000000000008","email":"cliente-b@turno.test","nombre":"Hilda Cliente"},
    {"id":"a0000000-0000-4000-8000-000000000009","email":"independiente@turno.test","nombre":"Iris Sola"},
    {"id":"a0000000-0000-4000-8000-000000000010","email":"dos-sitios@turno.test","nombre":"Pedro Dos Sitios"}
  ]'::jsonb;
begin
  -- ══ 0. DESMONTAR LO ANTERIOR ══════════════════════════════════════════════
  delete from turno_negocios where codigo_acceso in ('PRU-EMPL','PRU-RENT','PRU-SOLO','PRU-DOS');
  delete from turno_usuarios  where auth_id::text like 'a0000000-0000-4000-8000-%';
  delete from auth.users      where email like '%@turno.test';

  -- ══ 1. LAS CUENTAS ════════════════════════════════════════════════════════
  for r in select * from jsonb_to_recordset(v_gente) as x(id uuid, email text, nombre text) loop
    -- LAS CUATRO COLUMNAS DE ABAJO NO SON RELLENO. Costaron que la puerta
    -- entera diera error, y el motivo no se ve desde SQL.
    --
    -- `confirmation_token`, `recovery_token`, `email_change_token_new` y
    -- `email_change` admiten NULL en la tabla, así que un insert que no las
    -- nombre las deja en NULL y la fila se ve perfecta: la contraseña
    -- verifica, el correo está confirmado, la identidad existe. Pero GoTrue
    -- está escrito en Go y las lee como texto NO nulo, así que al entrar con
    -- contraseña falla ANTES de comprobar nada:
    --
    --   error finding user: sql: Scan error on column index 3,
    --   name "confirmation_token": converting NULL to string is unsupported
    --
    -- Y el error que llega al teléfono es un 500 genérico, que no dice ni
    -- remotamente esto. Solo aparece en los registros de auth del servidor.
    --
    -- GoTrue nunca deja estas columnas en NULL cuando crea la cuenta él: las
    -- pone en cadena vacía. Sembrar a mano es saltarse ese paso, así que hay
    -- que hacerlo aquí. Van las ocho de la familia, no las cuatro que
    -- fallaron: las otras cuatro tienen valor por defecto hoy, y depender de
    -- eso es esperar a que la próxima versión lo cambie.
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token,
      reauthentication_token)
    values (
      r.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      r.email, crypt(v_pass, gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(),
      '', '', '', '',
      '', '', '',
      '');

    -- Sin identidad, GoTrue no reconoce la cuenta como de email+contraseña.
    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), r.id, r.id::text,
      jsonb_build_object('sub', r.id::text, 'email', r.email, 'email_verified', true),
      'email', now(), now(), now());
  end loop;

  -- ══ 2. LOCAL DE EMPLEADOS ═════════════════════════════════════════════════
  perform set_config('request.jwt.claims',
    json_build_object('sub','a0000000-0000-4000-8000-000000000001')::text, true);
  perform turno_crear_negocio('Prueba Empleados','empleados','DOP',true,'barbero',
                              'Ana Admin','8090000001', 2, 10, 5, true, 1, 5, false, true);
  select n.id into v_neg_emp from turno_negocios n
    join turno_membresias m on m.negocio_id = n.id
   where m.usuario_id = (select id from turno_usuarios where auth_id = 'a0000000-0000-4000-8000-000000000001')
     and m.rol = 'dueno';
  update turno_negocios set codigo_acceso = 'PRU-EMPL' where id = v_neg_emp;
  select id into p_admin from turno_perfiles where negocio_id = v_neg_emp
   and usuario_id = (select id from turno_usuarios where auth_id = 'a0000000-0000-4000-8000-000000000001');

  -- ══ 3. LOCAL DE ALQUILER ══════════════════════════════════════════════════
  -- El casero NO atiende (atiende = false): así se ve de verdad la pantalla de
  -- quien solo alquila, que es donde el dinero no es suyo.
  perform set_config('request.jwt.claims',
    json_build_object('sub','a0000000-0000-4000-8000-000000000006')::text, true);
  perform turno_crear_negocio('Prueba Alquiler','espacios_rentados','DOP',false,'barbero',
                              'Fabio Casero','8090000006', 2, 10, 5, false, null, null, false, true);
  select n.id into v_neg_ren from turno_negocios n
    join turno_membresias m on m.negocio_id = n.id
   where m.usuario_id = (select id from turno_usuarios where auth_id = 'a0000000-0000-4000-8000-000000000006')
     and m.rol = 'dueno';
  update turno_negocios set codigo_acceso = 'PRU-RENT' where id = v_neg_ren;

  -- ══ 4. EL INDEPENDIENTE ═══════════════════════════════════════════════════
  perform set_config('request.jwt.claims',
    json_build_object('sub','a0000000-0000-4000-8000-000000000009')::text, true);
  perform turno_crear_negocio('Iris Sola','espacios_rentados','DOP',true,'barbero',
                              'Iris Sola','8090000009', 2, 10, 5, false, null, null, false, true);
  select n.id into v_neg_solo from turno_negocios n
    join turno_membresias m on m.negocio_id = n.id
   where m.usuario_id = (select id from turno_usuarios where auth_id = 'a0000000-0000-4000-8000-000000000009')
     and m.rol = 'dueno';
  update turno_negocios set codigo_acceso = 'PRU-SOLO' where id = v_neg_solo;
  select id into p_solo from turno_perfiles where negocio_id = v_neg_solo;

  -- ══ 5. EL DE DOS SITIOS ═══════════════════════════════════════════════════
  -- Primero su espacio propio, después entra de empleado en el otro local.
  perform set_config('request.jwt.claims',
    json_build_object('sub','a0000000-0000-4000-8000-000000000010')::text, true);
  perform turno_crear_negocio('Pedro Dos Sitios','espacios_rentados','DOP',true,'barbero',
                              'Pedro Dos Sitios','8090000010', 2, 10, 5, false, null, null, false, true);
  select n.id into v_neg_dos from turno_negocios n
    join turno_membresias m on m.negocio_id = n.id
   where m.usuario_id = (select id from turno_usuarios where auth_id = 'a0000000-0000-4000-8000-000000000010')
     and m.rol = 'dueno';
  update turno_negocios set codigo_acceso = 'PRU-DOS' where id = v_neg_dos;
  select id into p_dos_solo from turno_perfiles where negocio_id = v_neg_dos;

  -- ══ 6. LOS PROFESIONALES ENTRAN A SUS LOCALES ═════════════════════════════
  -- Entrar y que el local diga que sí: son las dos firmas de la migración 110.
  perform set_config('request.jwt.claims',
    json_build_object('sub','a0000000-0000-4000-8000-000000000002')::text, true);
  select * into v_perfil from turno_unirse_profesional('PRU-EMPL','barbero','empleado','Beto Empleado','8090000002');
  p_emp := v_perfil.id;

  perform set_config('request.jwt.claims',
    json_build_object('sub','a0000000-0000-4000-8000-000000000003')::text, true);
  select * into v_perfil from turno_unirse_profesional('PRU-EMPL','barbero','empleado','Caro Activa','8090000003');
  p_empa := v_perfil.id;

  perform set_config('request.jwt.claims',
    json_build_object('sub','a0000000-0000-4000-8000-000000000004')::text, true);
  select * into v_perfil from turno_unirse_profesional('PRU-EMPL','manicuri_pedicuri','empleado','Dana Uñas','8090000004');
  p_mani := v_perfil.id;

  perform set_config('request.jwt.claims',
    json_build_object('sub','a0000000-0000-4000-8000-000000000010')::text, true);
  select * into v_perfil from turno_unirse_profesional('PRU-EMPL','barbero','empleado','Pedro Dos Sitios','8090000010');
  p_dos_emp := v_perfil.id;

  perform set_config('request.jwt.claims',
    json_build_object('sub','a0000000-0000-4000-8000-000000000007')::text, true);
  select * into v_perfil from turno_unirse_profesional('PRU-RENT','barbero','barbero_renta','Gabo Rentado','8090000007');
  p_ren := v_perfil.id;

  -- Los aprueba cada administrador.
  perform set_config('request.jwt.claims',
    json_build_object('sub','a0000000-0000-4000-8000-000000000001')::text, true);
  perform turno_responder_solicitud(p_emp,  true);
  perform turno_responder_solicitud(p_empa, true);
  perform turno_responder_solicitud(p_mani, true);
  perform turno_responder_solicitud(p_dos_emp, true);
  -- A Caro se le da permiso de servirse de la fila; a Beto NO, a propósito:
  -- así se ven los dos lados de la migración 107 sin tocar nada.
  update turno_perfiles set acepta_por_su_cuenta = true  where id = p_empa;
  update turno_perfiles set acepta_por_su_cuenta = false where id = p_emp;
  update turno_perfiles set acepta_por_su_cuenta = false where id = p_dos_emp;

  perform set_config('request.jwt.claims',
    json_build_object('sub','a0000000-0000-4000-8000-000000000006')::text, true);
  perform turno_responder_solicitud(p_ren, true);

  -- ══ 7. SERVICIOS Y HORARIOS ═══════════════════════════════════════════════
  insert into turno_servicios (perfil_id, nombre, duracion_min, precio, activo)
  select pf, 'Corte', 30, 500, true from unnest(array[p_admin,p_emp,p_empa,p_ren,p_solo,p_dos_emp,p_dos_solo]) pf;
  insert into turno_servicios (perfil_id, nombre, duracion_min, precio, activo)
  select pf, 'Corte y barba', 45, 800, true from unnest(array[p_admin,p_emp,p_empa,p_ren,p_solo,p_dos_solo]) pf;
  insert into turno_servicios (perfil_id, nombre, duracion_min, precio, activo)
  values (p_mani, 'Manicura', 40, 700, true), (p_mani, 'Pedicura', 50, 900, true);

  -- Abiertos de 8 a 20 todos los días: aquí no se prueba el horario, se prueba
  -- todo lo demás, y un horario estrecho haría fallar la fila según la hora a
  -- la que te sientes a mirar.
  insert into turno_horarios (perfil_id, dia_semana, hora_inicio, hora_fin, activo, tiempo_entre_clientes)
  select pf, d, time '08:00', time '20:00', true, 0
    from unnest(array[p_admin,p_emp,p_empa,p_mani,p_ren,p_solo,p_dos_emp,p_dos_solo]) pf,
         generate_series(0,6) d
  on conflict (perfil_id, dia_semana) do update
    set hora_inicio = excluded.hora_inicio, hora_fin = excluded.hora_fin,
        activo = true, tiempo_entre_clientes = 0;

  -- ══ 8. LOS CLIENTES ═══════════════════════════════════════════════════════
  -- Eli se une a LOS DOS locales: es el caso de «un cliente, varias barberías».
  perform set_config('request.jwt.claims',
    json_build_object('sub','a0000000-0000-4000-8000-000000000005')::text, true);
  perform turno_unirse_cliente('PRU-EMPL', 'Eli Cliente', '8290000005');
  perform turno_unirse_cliente('PRU-RENT', 'Eli Cliente', '8290000005');

  perform set_config('request.jwt.claims',
    json_build_object('sub','a0000000-0000-4000-8000-000000000008')::text, true);
  perform turno_unirse_cliente('PRU-RENT', 'Hilda Cliente', '8290000008');

  raise notice 'Puerta de pruebas montada. Contraseña: %', v_pass;
end $$;
