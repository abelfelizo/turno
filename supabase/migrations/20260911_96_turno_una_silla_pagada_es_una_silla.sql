-- UNA SILLA PAGADA ES UNA SILLA
--
-- La migración 95 apagó la fila de quien no paga. Faltaba el agujero por el que
-- se cuela todo el mundo, dicho desde el teléfono con las palabras exactas:
--
--   «Si activa un barbero solo funcionaría con lo que ese barbero aporta a la
--    app (para protegernos de que solo uno pague y la usen 5).»
--
-- En un local de EMPLEADOS la suscripción es UNA, del negocio, y hasta aquí no
-- llevaba cuenta de por cuántas sillas se estaba pagando. El dueño pagaba una y
-- metía cinco barberos: los cinco aparecían, los cinco recibían fila. En un
-- local de asientos alquilados el problema no existe —cada silla paga la suya
-- desde la 93— pero con empleados era una puerta abierta de par en par.
--
-- ── EL CUPO ─────────────────────────────────────────────────────────────────
-- `turno_suscripciones.sillas_pagadas` dice por cuántas sillas se paga.
--
--   · NULL = sin tope. Es lo que vale durante la PRUEBA y con CORTESÍA, y es
--     deliberado: la prueba existe para que el local se vea entero funcionando,
--     y la cortesía es un regalo que damos nosotros a sabiendas.
--   · Un número = solo esas sillas trabajan, aunque haya más dadas de alta.
--
-- ── Y CUÁLES SON, CUANDO SOBRAN ─────────────────────────────────────────────
-- Por ANTIGÜEDAD, las primeras que entraron. No es la única opción posible
-- —podría elegirlas el dueño— pero es la única que no necesita que nadie decida
-- nada el día que vence el pago: el que lleva dos años cortando no se queda
-- fuera porque ayer entró alguien nuevo. Si el dueño quiere otro reparto, tiene
-- desvincular, que es una decisión suya y explícita.
--
-- El orden es (created_at, id): la fecha manda, y el id desempata para que dos
-- altas del mismo segundo no se turnen al azar entre consulta y consulta. Un
-- cupo que cambia de dueño cada vez que se refresca la pantalla es peor que no
-- tener cupo.
--
-- ── Y EL CLIENTE SOLO VE LO QUE PUEDE USAR ──────────────────────────────────
--   «Un cliente que entra a una barbería sin barberos con suscripción activa no
--    puede hacer nada, solo ve la información del negocio; solo ve los barberos
--    con suscripción activa.»
--
-- Hasta ahora turno_estado_local y turno_filas_abiertas devolvían TODAS las
-- sillas activas y aprobadas, y la de quien no paga salía con la fila cerrada.
-- Eso es enseñar un barbero que no se puede usar y explicar por qué con una
-- frase — y de paso airear en el escaparate que alguien no está al día. Desde
-- aquí, quien no paga sencillamente no está en la lista.
--
-- El local no desaparece: el cliente sigue viendo nombre, dirección y datos del
-- negocio. Lo que no ve es una fila que no existe.

-- ── POR CUÁNTAS SILLAS SE PAGA ──────────────────────────────────────────────
alter table turno_suscripciones add column if not exists sillas_pagadas int;

comment on column turno_suscripciones.sillas_pagadas is
  'Cuántas sillas cubre el pago. NULL = sin tope (prueba y cortesía). Cuando '
  'hay número, solo trabajan esas, por antigüedad. Ver migración 96.';

-- ── ¿SE ESTÁ PAGANDO POR ESTA SILLA? ────────────────────────────────────────
create or replace function turno_silla_al_dia(p_perfil uuid)
returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_neg uuid; v_tipo text; v_tz text; v_hoy date;
  v_cortesia boolean; v_pagada date; v_prueba date; v_hay boolean := false;
  v_cupo int; v_puesto int;
begin
  select p.negocio_id, n.tipo, coalesce(n.tz, 'America/Santo_Domingo')
    into v_neg, v_tipo, v_tz
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id
   where p.id = p_perfil;
  if v_neg is null then return false; end if;
  v_hoy := (now() at time zone v_tz)::date;

  -- ASIENTOS ALQUILADOS: cada silla paga la suya, así que no hay nada que
  -- repartir. Quién paga lo decidió la migración 93.
  if v_tipo = 'espacios_rentados' then
    select s.cortesia, s.pagada_hasta, s.prueba_hasta, true
      into v_cortesia, v_pagada, v_prueba, v_hay
      from turno_suscripciones_silla s where s.perfil_id = p_perfil;
    if not coalesce(v_hay, false) then return false; end if;
    if coalesce(v_cortesia, false) then return true; end if;
    return coalesce(v_pagada >= v_hoy, false) or coalesce(v_prueba >= v_hoy, false);
  end if;

  -- EMPLEADOS: paga el local, y desde la 96 por un NÚMERO de sillas.
  select s.cortesia, s.pagada_hasta, s.prueba_hasta, s.sillas_pagadas, true
    into v_cortesia, v_pagada, v_prueba, v_cupo, v_hay
    from turno_suscripciones s where s.negocio_id = v_neg;
  if not coalesce(v_hay, false) then return false; end if;

  -- Cortesía y prueba van sin tope: ver la cabecera.
  if coalesce(v_cortesia, false) then return true; end if;
  if coalesce(v_prueba >= v_hoy, false) then return true; end if;
  if not coalesce(v_pagada >= v_hoy, false) then return false; end if;
  if v_cupo is null then return true; end if;

  -- Está pagado, pero ¿entra esta silla en el cupo? Por antigüedad.
  select r.puesto into v_puesto
    from (
      select p.id, row_number() over (order by p.created_at, p.id) as puesto
        from turno_perfiles p
       where p.negocio_id = v_neg and p.activo and p.aprobado
    ) r
   where r.id = p_perfil;
  return coalesce(v_puesto, 0) between 1 and v_cupo;
end $$;

comment on function turno_silla_al_dia is
  'Si se está pagando por esta silla. En asientos alquilados, su propia '
  'suscripción; con empleados, la del local Y dentro de sillas_pagadas, por '
  'antigüedad — para que pagar una y usarla entre cinco no funcione. '
  'Ver migraciones 93, 95 y 96.';

grant execute on function turno_silla_al_dia(uuid) to authenticated, anon;

-- ── EL CLIENTE SOLO VE LAS SILLAS QUE PUEDE USAR ────────────────────────────
create or replace function turno_estado_local(p_negocio uuid)
returns table (perfil_id uuid, barbero text, tipo_servicio text, estado text,
               acepta boolean, cliente text, hasta time, en_cola int,
               acepta_citas boolean, acepta_fila boolean, modo text,
               fila_abierta boolean, fila_motivo text,
               desde timestamptz, fin_estimado timestamptz)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not (p_negocio in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;
  return query
  select p.id, u.nombre, p.tipo_servicio, e.estado, e.acepta, e.cliente, e.hasta, e.en_cola,
         e.acepta_citas, e.acepta_fila, e.modo, e.fila_abierta, e.fila_motivo,
         e.desde, e.fin_estimado
    from turno_perfiles p
    join turno_usuarios u on u.id = p.usuario_id
    cross join lateral public.turno_estado_barbero(p.id) e
   where p.negocio_id = p_negocio and p.activo and p.aprobado
     -- Migración 96: quien no está al día no sale en el escaparate. Enseñar un
     -- barbero que no se puede usar solo sirve para airear que no pagó.
     and public.turno_silla_al_dia(p.id)
   order by e.acepta desc, e.en_cola asc, u.nombre;
end $$;

comment on function turno_estado_local is
  'Silla por silla, para la tarjeta de estado. Solo las que están AL DÍA '
  '(migración 96): el cliente ve la información del local, pero no una fila que '
  'no puede usar.';

create or replace function turno_filas_abiertas(p_negocio uuid)
returns table (perfil_id uuid, abierta boolean, motivo text)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not (p_negocio in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;

  return query
    select p.id, public.turno_fila_abierta(p.id, p_negocio) is null,
           public.turno_fila_abierta(p.id, p_negocio)
      from turno_perfiles p
     where p.negocio_id = p_negocio and p.activo and p.aprobado
       and public.turno_silla_al_dia(p.id);
end $$;
