-- EL CASERO NO SE NOMBRA JEFE
--
-- La migración 92 le quitó al dueño de un local de asientos alquilados todo el
-- mando sobre quien le paga renta: no le opera la silla, no le lee la cartera,
-- no le lee la facturación. La 94 le quitó la aprobación. La 93 le quitó el
-- cobro. Tres puertas cerradas con la misma llave: la modalidad del LOCAL.
--
-- Y quedaba abierta la que las abre todas de golpe:
--
--   turno_cambiar_modalidad(perfil, 'empleado')
--
-- Comprobado contra la base: la función solo pregunta si eres admin del local.
-- En un local de `espacios_rentados`, el dueño le da a "Empleado" en la ficha de
-- su inquilino y al instante turno_perfil_autonomo(él) pasa a false, así que
-- turno_manda_en_la_silla(él) pasa a true, y con eso recupera de una vez todo lo
-- que la 92 le había quitado. No hace falta saltarse ningún portero: se entra
-- por la puerta principal, que estaba sin cerrar.
--
-- ── Y ADEMÁS SALE GRATIS, QUE ES LO QUE LO DELATA ───────────────────────────
-- turno_silla_al_dia mira el TIPO DEL LOCAL, no la modalidad de la persona. En
-- un local de asientos alquilados sigue cobrándole a `turno_suscripciones_silla`
-- del inquilino aunque su membresía diga 'empleado'. Así que el dueño se queda
-- con un empleado al que dirige entero y cuya app paga el propio empleado.
--
-- Eso choca de frente con la regla, dicha desde el teléfono:
--
--   «El barbero siempre paga, ya sea por aporte del dueño si es empleado o por
--    su propia cuenta, y eso es lo que determina la forma en la que ingresa al
--    negocio y los permisos o poderes que tenga.»
--
-- **Control y pago viajan juntos.** Donde el dueño no pone, el dueño no manda.
--
-- ── LA ASIMETRÍA ES A PROPÓSITO ─────────────────────────────────────────────
-- Esto NO prohíbe los locales mixtos: una barbería de EMPLEADOS puede alquilar
-- un asiento suelto, y eso se queda como está. Lo que no puede existir es el
-- revés —un empleado dentro de un local de alquiler— porque ahí no hay
-- suscripción del local de la que salga su aporte: el esquema no tiene sitio
-- para un empleado que se paga solo.
--
-- Y no es una regla nueva, es la que ya seguía la puerta de entrada:
-- turno_unirse_profesional DERIVA el rol del tipo del local desde la migración
-- 38, y en `espacios_rentados` siempre entra 'barbero_renta' pida lo que pida.
-- Cambiar la modalidad después era la forma de saltarse esa derivación una vez
-- dentro. Aquí las dos puertas pasan por fin a decir lo mismo.
--
-- ── QUÉ HACE EL DUEÑO QUE DE VERDAD QUIERE EMPLEADOS ────────────────────────
-- Cambiar la modalidad DEL LOCAL (turno_cambiar_tipo_negocio), que realinea a
-- todo el equipo y pone al local a pagar por ellos. Es la decisión honesta y ya
-- existe; lo que no puede es quedarse con el mando sin la cuenta.

create or replace function turno_cambiar_modalidad(p_perfil uuid, p_rol text)
returns void
language plpgsql security definer set search_path to 'public' as $$
declare v_u uuid; v_neg uuid; v_tipo text;
begin
  if p_rol not in ('empleado','barbero_renta') then raise exception 'modalidad invalida'; end if;
  select p.usuario_id, p.negocio_id, n.tipo
    into v_u, v_neg, v_tipo
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id
   where p.id = p_perfil;
  if v_neg is null then raise exception 'perfil inexistente'; end if;
  if not (v_neg in (select public.turno_negocios_admin())) then raise exception 'no autorizado'; end if;
  if exists(select 1 from turno_membresias
             where usuario_id = v_u and negocio_id = v_neg and rol = 'dueno' and activo) then
    raise exception 'el dueño del local no cambia de modalidad';
  end if;

  -- Migración 98. Donde no pones, no mandas: en un local de asientos alquilados
  -- no hay suscripción del local de la que salga el aporte de un empleado, así
  -- que nombrar empleado a alguien ahí sería dirigirlo gratis.
  if p_rol = 'empleado' and v_tipo = 'espacios_rentados' then
    raise exception 'aquí alquilas asientos: cada barbero es su propio negocio. '
                    'Para tener empleados, cambia la modalidad del local.';
  end if;

  update turno_membresias set rol = p_rol
   where usuario_id = v_u and negocio_id = v_neg and rol in ('empleado','barbero_renta');
end $$;

comment on function turno_cambiar_modalidad is
  'El dueño alquila un asiento suelto dentro de un local de empleados. Al revés '
  'NO: un empleado dentro de un local de alquiler sería dirigido por quien no '
  'aporta nada a su app. Control y pago viajan juntos (migración 98).';
