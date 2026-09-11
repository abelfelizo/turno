-- EL CUPO SE VE
--
-- La migración 96 metió `turno_suscripciones.sillas_pagadas`: el número de
-- sillas por las que se paga en un local de empleados. Decide QUIÉN TRABAJA —
-- cuando sobran, entran las más antiguas y el resto desaparece de la app— y se
-- quedó sin salir por ninguna puerta. `turno_suscripcion()` devuelve el estado,
-- la fecha y cuántos asientos hay dados de alta, pero no por cuántos se paga.
--
-- O sea que el dueño podía ver "Al día · 4 asientos" mientras dos de sus cuatro
-- barberos no aparecían para nadie, sin una sola pantalla donde enterarse. Es el
-- mismo fallo de la 95 en otro sitio: la regla se aplicó y no se contó.
--
-- Una regla que decide quién come y que el afectado no puede consultar no es una
-- regla, es una sorpresa.
--
-- ── POR QUÉ UN DROP ─────────────────────────────────────────────────────────
-- `create or replace` no puede AÑADIR una columna al TABLE de retorno: Postgres
-- contesta "cannot change return type of existing function". Así que se borra y
-- se vuelve a crear — y con el drop se van los GRANT, que por eso van repetidos
-- abajo con su `revoke ... from public, anon` al lado. PUBLIC tiene EXECUTE por
-- defecto en toda función nueva y `anon` hereda de PUBLIC: un grant suelto no
-- cierra nada (la lección de la 89 y de la 97).
--
-- ── NULL SIGNIFICA SIN TOPE ─────────────────────────────────────────────────
-- Y se devuelve tal cual, sin traducirlo a un número: es lo que vale durante la
-- prueba y con cortesía, y la pantalla necesita distinguir "sin tope" de "tope
-- de cero". Rellenarlo aquí con `coalesce(..., asientos)` haría que un local en
-- prueba pareciera tener un cupo justo a medida, que es una casualidad rara y
-- una mentira en cuanto se dé de alta un barbero más.

drop function if exists turno_suscripcion(uuid);

create function turno_suscripcion(p_negocio uuid)
returns table (estado text, al_dia boolean, hasta date, dias_restantes int,
               asientos int, sillas_pagadas int)
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_row turno_suscripciones; v_hoy date; v_tz text; v_asientos int;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not (p_negocio in (select public.turno_negocios_admin())) then
    raise exception 'sin acceso al negocio';
  end if;

  select coalesce(tz, 'America/Santo_Domingo') into v_tz from turno_negocios where id = p_negocio;
  if v_tz is null then raise exception 'ese local no existe'; end if;
  v_hoy := (now() at time zone v_tz)::date;

  select * into v_row from turno_suscripciones where negocio_id = p_negocio;
  v_asientos := public.turno_asientos_negocio(p_negocio);

  if v_row.negocio_id is null then
    return query select 'vencida'::text, false, null::date, null::int, v_asientos, null::int;
    return;
  end if;

  -- La cortesía y la prueba van SIN tope (migración 96), así que se devuelve
  -- null aunque la columna tenga un número guardado de antes: lo que manda es
  -- lo que turno_silla_al_dia va a hacer, no lo que hay escrito en la fila.
  if v_row.cortesia then
    return query select 'cortesia'::text, true, null::date, null::int, v_asientos, null::int;
    return;
  end if;

  if v_row.pagada_hasta is not null and v_row.pagada_hasta >= v_hoy then
    return query select 'activa'::text, true, v_row.pagada_hasta,
                        (v_row.pagada_hasta - v_hoy)::int, v_asientos, v_row.sillas_pagadas;
    return;
  end if;

  if v_row.prueba_hasta is not null and v_row.prueba_hasta >= v_hoy then
    return query select 'prueba'::text, true, v_row.prueba_hasta,
                        (v_row.prueba_hasta - v_hoy)::int, v_asientos, null::int;
    return;
  end if;

  return query select 'vencida'::text, false,
                      greatest(coalesce(v_row.pagada_hasta, '-infinity'::date),
                               coalesce(v_row.prueba_hasta, '-infinity'::date)),
                      (greatest(coalesce(v_row.pagada_hasta, '-infinity'::date),
                                coalesce(v_row.prueba_hasta, '-infinity'::date)) - v_hoy)::int,
                      v_asientos, v_row.sillas_pagadas;
end $$;

comment on function turno_suscripcion is
  'La situación de pago del LOCAL, para su dueño. Desde la migración 99 dice '
  'también por cuántas sillas se paga (null = sin tope, que es lo que vale en '
  'prueba y cortesía): ese número decide quién aparece en la app, así que el '
  'dueño tiene que poder verlo.';

grant execute on function turno_suscripcion(uuid) to authenticated;
revoke execute on function turno_suscripcion(uuid) from public, anon;
