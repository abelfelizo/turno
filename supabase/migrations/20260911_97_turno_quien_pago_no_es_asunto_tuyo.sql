-- QUIÉN PAGÓ NO ES ASUNTO TUYO
--
-- La migración 95 tuvo el cuidado de que el letrero NO delatara al barbero que
-- no había pagado: donde el cliente mira, dice la frase neutra «no está tomando
-- clientes ahora mismo» y nada más. Ese cuidado está escrito en su cabecera.
--
-- Y acto seguido dejó la respuesta entera colgando de la puerta de al lado:
--
--   grant execute on function turno_silla_al_dia(uuid) to authenticated, anon;
--
-- Un booleano por perfil, contestado a cualquiera con la llave del APK. Es la
-- misma pregunta que el letrero se niega a contestar, hecha directamente. Y lo
-- mismo vale para las otras dos, que desde la 95 llevan el cobro dentro:
-- turno_perfil_acepta y turno_perfil_operable devuelven false cuando la silla
-- no está al día, así que enumerando perfiles se saca la lista de morosos de un
-- local. Esta es exactamente la forma del fallo de la 89 —la puerta cerrada en
-- la pantalla y abierta en el API— repetida por tercera vez.
--
-- ── POR QUÉ SE PUEDE QUITAR SIN ROMPER NADA ─────────────────────────────────
-- Comprobado contra la base antes de tocarla, que es lo que pide el método:
--
--   · Ninguna de las tres aparece en una política RLS (pg_policies) ni en un
--     CHECK (pg_constraint). Esa era la razón por la que turno_perfil_acepta y
--     turno_perfil_operable estaban EXENTAS en la red de puertas.test.sql —
--     «ayudantes que viven dentro de una política»— y esa razón hoy es falsa.
--     Una exención con el motivo caducado es peor que ninguna: parece decidida.
--   · Quien las llama son turno_fila_abierta, turno_estado_local,
--     turno_filas_abiertas y turno_perfil_acepta/operable, todas SECURITY
--     DEFINER: dentro de ellas se ejecuta con el rol del dueño de la función,
--     no con el de quien llama, así que el permiso del cliente no interviene.
--   · La app no las llama por RPC en ningún sitio (grep sobre lib/, app/ y
--     components/: cero).
--
-- Así que el grant no sostenía nada. Solo contestaba.
--
-- Se va PUBLIC además de anon y authenticated: PUBLIC tiene EXECUTE por defecto
-- en toda función nueva y los dos roles heredan de él, así que revocar solo a
-- los roles no cierra nada. Es la lección de la migración 89 y es la razón de
-- que estas tres líneas lleven los tres nombres.

revoke execute on function turno_silla_al_dia(uuid)    from public, anon, authenticated;
revoke execute on function turno_perfil_acepta(uuid, date) from public, anon, authenticated;
revoke execute on function turno_perfil_operable(uuid) from public, anon, authenticated;

comment on function turno_silla_al_dia is
  'Si se está pagando por esta silla. En asientos alquilados, su propia '
  'suscripción; con empleados, la del local Y dentro de sillas_pagadas, por '
  'antigüedad. SIN permiso para nadie más que el dueño de la base: solo la '
  'llaman funciones SECURITY DEFINER, y contestarla de frente es delatar al '
  'que no pagó (migración 97). Ver migraciones 93, 95 y 96.';

comment on function turno_perfil_acepta is
  'Si esta silla puede recibir trabajo ahora (o ese día, con p_fecha). Lleva el '
  'cobro dentro desde la 95, así que no se contesta de frente: ver 97.';
