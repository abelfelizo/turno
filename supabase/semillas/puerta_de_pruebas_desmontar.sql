-- ─────────────────────────────────────────────────────────────────────────────
-- DESMONTAR LA PUERTA DE PRUEBAS
--
-- Borra el reparto entero y sus dos locales. Se corre cuando el onboarding esté
-- como debe ser y la puerta ya no haga falta.
--
-- EL ORDEN IMPORTA. `turno_usuarios.auth_id` es ON DELETE SET NULL, no CASCADE:
-- si se borra primero la cuenta de `auth.users`, la fila de `turno_usuarios` se
-- queda ahí con el auth_id en nulo — un usuario fantasma que ya no se puede
-- encontrar ni volver a borrar por correo. Así que: primero los negocios (que
-- sí arrastran membresías, perfiles, servicios, horarios y cola), después los
-- usuarios de Turno, y al final las cuentas.
--
-- Solo toca lo que empieza por `PRU-` y lo que acaba en `@turno.test`. La base
-- es compartida con otro proyecto en producción; nada de esto lo roza.
--
-- USO: pegar en el editor SQL de Supabase.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare v_neg int; v_usr int; v_cue int;
begin
  delete from turno_negocios where codigo_acceso in ('PRU-EMPL','PRU-RENT','PRU-SOLO','PRU-DOS');
  get diagnostics v_neg = row_count;

  delete from turno_usuarios where auth_id::text like 'a0000000-0000-4000-8000-%';
  get diagnostics v_usr = row_count;

  delete from auth.users where email like '%@turno.test';
  get diagnostics v_cue = row_count;

  raise notice 'Desmontada: % locales, % usuarios de Turno, % cuentas.', v_neg, v_usr, v_cue;
end $$;

-- Y la comprobación, por si algo quedó suelto. Las tres cuentas deben dar 0.
select 'negocios de prueba'  as que, count(*) as quedan from turno_negocios where codigo_acceso like 'PRU-%'
union all
select 'usuarios de Turno',  count(*) from turno_usuarios where auth_id::text like 'a0000000-0000-4000-8000-%'
union all
select 'usuarios huerfanos', count(*) from turno_usuarios where auth_id is null
union all
select 'cuentas @turno.test', count(*) from auth.users where email like '%@turno.test';
