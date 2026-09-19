-- EL DÍA QUE EMPEZAMOS A COBRAR
--
-- Esta migración TOMA LA DECISIÓN que las migraciones 86 y 93 dejaron
-- deliberadamente sin tomar, y que `suscripcion.test.sql` llevaba guardando con
-- dos casos trampa y este mensaje de fallo:
--
--   «Si esto fue a propósito, cambia ESTE caso; si no, alguien metió una regla
--    de cobro sin decidirla.»
--
-- Fue a propósito. Dicho desde el teléfono:
--
--   «Una cuenta de dueño necesita al menos un barbero pago para habilitar las
--    funciones de fila. Sin eso no puede hacer nada, solo ve la cuenta. Y
--    aquellos barberos que estén en una barbería y no paguen no aparecen ni
--    tienen acceso a la cola de la barbería.»
--
-- Así que los dos casos cambian de signo, a conciencia y con la migración
-- delante. Eso es exactamente para lo que estaban puestos.
--
-- ── UNA SOLA PALANCA ────────────────────────────────────────────────────────
-- La regla parece dos reglas —una para el barbero y otra para el dueño— pero es
-- una, y la del dueño sale sola:
--
--   · turno_silla_al_dia(perfil) dice si POR ESA SILLA se está pagando. Quién
--     paga ya lo decidió la 93 según la modalidad del local: en asientos
--     alquilados, la silla; con empleados, la barbería.
--   · Una silla que no está al día deja de ser OPERABLE y deja de ACEPTAR
--     trabajo. Con eso el barbero «no aparece y no tiene acceso a la cola».
--   · Y el dueño «necesita al menos un barbero pago» sin que haya que escribirlo
--     por separado: en un local de empleados, si él no paga, NINGUNA de sus
--     sillas está al día —todas cuelgan de la misma suscripción— así que no
--     puede llamar, ni sentar, ni ocupar. Y su propia silla tampoco. Le queda
--     ver la cuenta, que es justo lo que se pidió.
--
-- Por eso el enganche va en turno_perfil_operable y en turno_perfil_acepta, que
-- son los dos sitios por los que ya pasaba todo, en vez de repartir un `if` de
-- cobro por quince funciones. Una regla escrita en quince sitios se corrige en
-- catorce.
--
-- ── LO QUE NO SE APAGA ──────────────────────────────────────────────────────
-- Las CITAS YA RESERVADAS no se tocan y el historial tampoco: el cliente que
-- tiene hora el jueves no tiene por qué pagar el descuido de nadie, y los datos
-- del barbero siguen siendo suyos. Lo que se apaga es la fila —aparecer en la
-- fachada y recibir por la app—, que es el servicio que se cobra.
--
-- ── Y OJO CON EL LETRERO ────────────────────────────────────────────────────
-- turno_fila_abierta devuelve el motivo que ve EL CLIENTE, y el cliente no tiene
-- por qué enterarse de que su barbero no pagó la app: eso es un problema entre
-- el barbero y nosotros, no una nota en el escaparate de su negocio. Se usa la
-- frase neutra que ya existía. El barbero sí lo ve claro, en su propia pantalla,
-- donde turno_suscripcion_de le dice "Vencida".

-- ── ¿SE ESTÁ PAGANDO POR ESTA SILLA? ────────────────────────────────────────
-- Sin portero de autorización a propósito: la llaman turno_perfil_acepta y
-- turno_fila_abierta, que las usa cualquier cliente del local. Devuelve un
-- booleano y nada más, así que no hay nada que filtrar.
create or replace function turno_silla_al_dia(p_perfil uuid)
returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_neg uuid; v_tipo text; v_tz text; v_hoy date;
  v_cortesia boolean; v_pagada date; v_prueba date; v_hay boolean := false;
begin
  select p.negocio_id, n.tipo, coalesce(n.tz, 'America/Santo_Domingo')
    into v_neg, v_tipo, v_tz
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id
   where p.id = p_perfil;
  if v_neg is null then return false; end if;
  v_hoy := (now() at time zone v_tz)::date;

  -- Quién paga lo decidió la 93 y aquí solo se consulta: la modalidad del LOCAL.
  if v_tipo = 'espacios_rentados' then
    select s.cortesia, s.pagada_hasta, s.prueba_hasta, true
      into v_cortesia, v_pagada, v_prueba, v_hay
      from turno_suscripciones_silla s where s.perfil_id = p_perfil;
  else
    select s.cortesia, s.pagada_hasta, s.prueba_hasta, true
      into v_cortesia, v_pagada, v_prueba, v_hay
      from turno_suscripciones s where s.negocio_id = v_neg;
  end if;

  if not coalesce(v_hay, false) then return false; end if;
  if coalesce(v_cortesia, false) then return true; end if;
  return coalesce(v_pagada >= v_hoy, false) or coalesce(v_prueba >= v_hoy, false);
end $$;

comment on function turno_silla_al_dia is
  'Si se está pagando por esta silla. Quién paga lo decide la modalidad del '
  'local (migración 93). Sin portero a propósito: la llaman funciones que usa '
  'cualquier cliente y solo devuelve un booleano. Ver migración 95.';

grant execute on function turno_silla_al_dia(uuid) to authenticated, anon;

-- ── NO APARECE Y NO LE ENTRA NADIE ──────────────────────────────────────────
create or replace function turno_perfil_acepta(p_perfil uuid, p_fecha date default null)
returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare v_est text; v_modo text; v_susp boolean;
begin
  if p_perfil is null then return true; end if;

  select coalesce(pr.estado_actual, 'disponible'), coalesce(pr.modo_atencion, 'ambos'),
         coalesce(pr.suspendido, false)
    into v_est, v_modo, v_susp
    from turno_perfiles pr
   where pr.id = p_perfil and pr.activo and pr.aprobado;
  if v_est is null then return false; end if;

  -- El cobro, desde la migración 95. Va ANTES que lo demás porque no es un
  -- estado del barbero: es si el servicio está contratado.
  if not public.turno_silla_al_dia(p_perfil) then return false; end if;

  if v_susp then return false; end if;
  if v_est = 'inactivo' then return false; end if;
  if v_est = 'descanso' and p_fecha is null then return false; end if;
  if p_fecha is null and v_modo = 'solo_citas' then return false; end if;
  if p_fecha is not null and v_modo = 'solo_fila' then return false; end if;
  return true;
end $$;

-- ── NI PUEDE OPERAR LA FILA ─────────────────────────────────────────────────
create or replace function turno_perfil_operable(p_perfil uuid)
returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists(
    select 1 from public.turno_perfiles pr
     where pr.id = p_perfil
       and pr.activo and pr.aprobado
       and public.turno_manda_en_la_silla(p_perfil)
       and public.turno_silla_al_dia(p_perfil)
       -- La suspensión apaga al empleado; al autónomo solo lo saca de la fila y
       -- la fachada del local, nunca de su propio trabajo (migración 92).
       and (public.turno_perfil_autonomo(p_perfil)
            or not coalesce(pr.suspendido, false))
  )
$$;

comment on function turno_perfil_operable is
  'Silla viva, aprobada, AL DÍA (migración 95) y cuyo negocio es mío '
  '(turno_manda_en_la_silla, migración 92). Sin suscripción no hay fila: ni '
  'aparece, ni entra nadie, ni se opera.';

-- ── Y EL LETRERO LO DICE SIN DELATAR A NADIE ────────────────────────────────
create or replace function turno_fila_abierta(p_perfil uuid, p_negocio uuid default null)
returns text
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_neg uuid; v_tz text; v_ahora timestamp; v_dow int;
  v_ini time; v_fin time; v_tiene_horario boolean; v_abierto boolean;
  v_est text; v_modo text; v_susp boolean; v_motivo text;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if p_perfil is null then
    if p_negocio is null then return null; end if;
    select coalesce(tz, 'America/Santo_Domingo') into v_tz from turno_negocios where id = p_negocio;
    v_ahora := (now() at time zone coalesce(v_tz, 'America/Santo_Domingo'));
    select exists(
      select 1 from turno_perfiles p
        cross join lateral public.turno_jornada_de(p.id, v_ahora::date) j
       where p.negocio_id = p_negocio and p.activo and p.aprobado
         and v_ahora::time >= j.hora_inicio and v_ahora::time < j.hora_fin
         and public.turno_perfil_acepta(p.id, null)
    ) into v_abierto;
    if v_abierto then return null; end if;
    return 'ahora mismo no hay nadie abierto en el local';
  end if;
  select p.negocio_id, coalesce(n.tz, 'America/Santo_Domingo'),
         coalesce(p.estado_actual, 'disponible'), coalesce(p.modo_atencion, 'ambos'),
         coalesce(p.suspendido, false), p.suspendido_motivo
    into v_neg, v_tz, v_est, v_modo, v_susp, v_motivo
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id
   where p.id = p_perfil and p.activo and p.aprobado;
  if v_neg is null then return 'no está disponible'; end if;

  -- Frase NEUTRA a propósito: el cliente no tiene por qué enterarse de que su
  -- barbero no pagó la app. Ver la cabecera de la migración 95.
  if not public.turno_silla_al_dia(p_perfil) then
    return 'no está tomando clientes ahora mismo';
  end if;

  if v_susp then return coalesce(nullif(trim(v_motivo), ''), 'no está atendiendo por ahora'); end if;
  if not public.turno_perfil_acepta(p_perfil, null) then
    if v_est = 'inactivo' then return 'no está trabajando ahora mismo'; end if;
    if v_est = 'descanso' then return 'está en descanso'; end if;
    if v_modo = 'solo_citas' then return 'solo trabaja con cita'; end if;
    return 'no está tomando clientes ahora mismo';
  end if;
  v_ahora := (now() at time zone v_tz);
  v_dow := extract(dow from v_ahora);
  select exists(select 1 from turno_horarios where perfil_id = p_perfil) into v_tiene_horario;
  if not v_tiene_horario then
    return 'todavía no ha puesto su horario, así que su fila no está abierta';
  end if;
  select j.hora_inicio, j.hora_fin into v_ini, v_fin
    from turno_jornada_de(p_perfil, v_ahora::date) j;
  if v_ini is null then return 'hoy no trabaja: su fila abre los días que tiene marcados'; end if;
  if v_ahora::time < v_ini or v_ahora::time >= v_fin then
    return 'ahora está cerrado: su fila abre de ' || to_char(v_ini, 'HH24:MI')
        || ' a ' || to_char(v_fin, 'HH24:MI');
  end if;
  return null;
end $$;

-- ── PARA LA PANTALLA DEL DUEÑO: ¿HAY ALGUNA SILLA AL DÍA? ───────────────────
-- La regla ya se aplica sola silla por silla; esto existe para poder DECIRLO en
-- el panel en vez de dejar al dueño tocando botones que no hacen nada.
create or replace function turno_local_operativo(p_negocio uuid)
returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists(
    select 1 from public.turno_perfiles p
     where p.negocio_id = p_negocio and p.activo and p.aprobado
       and public.turno_silla_al_dia(p.id)
  )
$$;

comment on function turno_local_operativo is
  'Si al local le queda al menos una silla al día. La fila se habilita silla a '
  'silla; esto solo sirve para poder decírselo al dueño. Ver migración 95.';

grant execute on function turno_local_operativo(uuid) to authenticated;
revoke execute on function turno_local_operativo(uuid) from public, anon;
