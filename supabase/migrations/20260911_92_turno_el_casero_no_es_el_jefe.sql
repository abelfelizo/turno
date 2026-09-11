-- EL CASERO NO ES EL JEFE
--
-- Reportado desde el teléfono, y es la pregunta de producto más grande que ha
-- entrado hasta ahora:
--
--   «El barbero que alquila un asiento y paga su aplicación pero la barbería no
--    la paga, él maneja lo de él de manera independiente a la barbería. ¿Qué
--    poder tiene? El perfil dueño solo debe servir para agrupar barberos en
--    caso de que sean alquilados. No debería tener control sobre ninguno.
--    Diferente a que si son empleados, ahí sí tendría control.»
--
-- El repo ya tenía media regla escrita. R11 (migración 88) dice quién manda en
-- el HORARIO:
--
--     (es_mi_perfil AND autonomo) OR (perfil_admin AND NOT autonomo)
--
-- Pero el resto del poder del dueño no pasaba por ahí: pasaba por
-- turno_perfil_operable, que decía «mi silla, O soy el dueño del local» sin
-- mirar la modalidad. Con eso, el dueño de un local de asientos alquilados
-- podía, sobre la silla de alguien que le PAGA RENTA:
--
--   · llamarle clientes y sentarle gente (turno_llamar_siguiente,
--     turno_atender_sin_cita, turno_registrar_fisico)
--   · levantarle al que tuviera en la silla (turno_cola_operable)
--   · cerrarle la jornada y devolverle el horario (turno_cerrar_jornada,
--     turno_jornada_normal)
--   · leerle la cartera de clientes CON TELÉFONOS (turno_clientes_por_recuperar)
--   · y leerle la facturación (turno_stats_periodo_perfil)
--
-- Eso no es agrupar: es dirigir. Un barbero que paga su asiento y su
-- suscripción no trabaja para el dueño del local.
--
-- ── LA REGLA, EN UN SOLO SITIO ──────────────────────────────────────────────
-- turno_manda_en_la_silla es turno_manda_en_el_horario extendido de las horas
-- al negocio entero, y con la misma forma para que las dos se lean igual:
--
--     es mía  OR  (soy el dueño del local  AND  no es autónomo)
--
-- «Autónomo» ya lo define el repo como membresía en ('barbero_renta','dueno'),
-- así que la regla sale sola: al EMPLEADO lo dirige su barbería; al que RENTA,
-- nadie. Y el dueño sigue mandando en su propia silla por la primera rama.
--
-- ── SUSPENDER DEJA DE SER UN INTERRUPTOR DE APAGADO ─────────────────────────
-- Aquí está el otro cambio, y viene de la misma conversación:
--
--   «Si el dueño no tiene ningún poder sobre el barbero y decide suspenderlo o
--    sacarlo, el barbero podría seguir operando con su app.»
--
-- Exacto, y ESO ES LO QUE DEBE PASAR. Si el dueño pudiera apagarle la app no
-- sería su casero, sería su jefe — y entonces no es un alquiler. Lo que el
-- dueño controla legítimamente es el acceso a lo que es DEL LOCAL: la fila de
-- "cualquiera disponible" y la fachada donde el cliente elige silla.
--
-- Y esa mitad ya funcionaba sola: `suspendido` hace que turno_perfil_acepta
-- devuelva false, y con eso turno_fila_abierta lo saca del escaparate y la
-- puerta lo rechaza. Lo que sobraba era la OTRA mitad: turno_perfil_operable
-- también miraba `suspendido`, y eso le apagaba la silla entera — no podía ni
-- sentar a quien tuviera delante.
--
-- Desde aquí, para un perfil AUTÓNOMO, suspender significa exactamente «te saco
-- de la fila y de la fachada del local»: sigue atendiendo a quien tenga
-- delante, sigue con su agenda, sus precios, sus horarios y su dinero. Para un
-- EMPLEADO no cambia nada: a su patrón sí le corresponde pararlo.
--
-- Es la misma doctrina que ya rige el local cerrado desde la migración 70 —«el
-- barbero puede sentar a quien tiene delante aunque la fila esté cerrada»— y
-- que jornada.test.sql lleva fijando desde entonces.
--
-- ── LO QUE NO SE TOCA, A PROPÓSITO ──────────────────────────────────────────
--   · LA FILA DEL LOCAL SIGUE COMPARTIDA. Un turno sin barbero asignado no pasa
--     por turno_perfil_operable: turno_cola_operable lo resuelve por la rama de
--     «pertenezco al equipo o soy el dueño». El local sigue siendo un local y
--     el que entra sin elegir sigue pudiendo tocarle a cualquiera.
--   · VER NO ES MANDAR. turno_estado_barbero sigue dejando al dueño ver el
--     estado de cada silla de su local: lo tiene delante de los ojos, y sin eso
--     su panel no existe. Lo que pierde es operarla.
--   · DESVINCULAR SIGUE SIENDO SUYO. Echar a un inquilino es del casero.
--
-- Ninguna política RLS usa turno_perfil_operable —se comprobó contra pg_policies
-- antes de tocarla— así que el cambio queda contenido en las funciones
-- SECURITY DEFINER que la llaman.

-- ── QUIÉN MANDA EN EL NEGOCIO DE ESTA SILLA ─────────────────────────────────
-- Sin mirar activo/aprobado/suspendido: eso es «¿puede trabajar AHORA?», y es
-- otra pregunta. Esta es «¿de quién es este negocio?», que no caduca — por eso
-- sirve también para leer el historial de una silla ya dada de baja.
create or replace function turno_manda_en_la_silla(p_perfil uuid)
returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists(
    select 1 from public.turno_perfiles pr
     where pr.id = p_perfil
       and (pr.usuario_id = public.turno_uid()
            or (pr.negocio_id in (select public.turno_negocios_admin())
                and not public.turno_perfil_autonomo(p_perfil)))
  )
$$;

comment on function turno_manda_en_la_silla is
  'De quién es el negocio de esta silla: suya, o de la barbería cuando es un '
  'EMPLEADO. Al que renta su asiento no lo dirige nadie. Es turno_manda_en_el_'
  'horario extendido de las horas al negocio entero. Ver migración 92.';

grant execute on function turno_manda_en_la_silla(uuid) to authenticated;
revoke execute on function turno_manda_en_la_silla(uuid) from public, anon;

-- ── ¿PUEDE TRABAJAR ESTA SILLA, Y LA MANEJO YO? ─────────────────────────────
create or replace function turno_perfil_operable(p_perfil uuid)
returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists(
    select 1 from public.turno_perfiles pr
     where pr.id = p_perfil
       and pr.activo and pr.aprobado
       and public.turno_manda_en_la_silla(p_perfil)
       -- La suspensión para al EMPLEADO. Al autónomo solo le quita la fila y
       -- la fachada del local (vía turno_perfil_acepta): sigue atendiendo a
       -- quien tenga delante. Ver la cabecera.
       and (public.turno_perfil_autonomo(p_perfil)
            or not coalesce(pr.suspendido, false))
  )
$$;

comment on function turno_perfil_operable is
  'Silla viva, aprobada, y cuyo negocio es mío (turno_manda_en_la_silla). La '
  'suspensión apaga al empleado; al autónomo solo lo saca de la fila y la '
  'fachada del local, nunca de su propio trabajo. Ver migración 92.';

-- ── LA CARTERA DE CLIENTES ES DE QUIEN LA HIZO ──────────────────────────────
-- Nombres y TELÉFONOS. Antes bastaba con ser dueño del local; ahora, si el
-- barbero paga renta, sus clientes son suyos.
create or replace function turno_clientes_por_recuperar(p_perfil uuid)
returns table (cliente_id uuid, nombre text, telefono text, ultima date, dias int)
language plpgsql stable security definer set search_path to 'public' as $$
declare v_usuario uuid; v_dias int;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not public.turno_manda_en_la_silla(p_perfil) then
    raise exception 'esa cartera de clientes no es tuya';
  end if;

  select usuario_id, coalesce(revisita_dias, 30) into v_usuario, v_dias
    from turno_perfiles where id = p_perfil;
  if v_usuario is null then return; end if;
  return query
    with u as (
      select hv.cliente_id, max(hv.fecha) as ultima
        from turno_historial_visitas hv
       where hv.perfil_id in (select id from turno_perfiles where usuario_id = v_usuario)
       group by hv.cliente_id
    )
    select u.cliente_id, us.nombre, us.telefono, u.ultima,
           (current_date - u.ultima)::int
      from u join turno_usuarios us on us.id = u.cliente_id
     where (current_date - u.ultima) >= v_dias
     order by u.ultima asc;
end $$;

comment on function turno_clientes_por_recuperar is
  'Los clientes de esta silla que llevan sin volver más de revisita_dias. Con '
  'nombre y teléfono, así que la lee quien manda en la silla: el barbero, y su '
  'barbería solo si es empleado. Ver migraciones 52 y 92.';

grant execute on function turno_clientes_por_recuperar(uuid) to authenticated;
revoke execute on function turno_clientes_por_recuperar(uuid) from public, anon;

-- ── Y LA FACTURACIÓN TAMBIÉN ────────────────────────────────────────────────
-- La 89 le puso el portero que le faltaba; aquí cambia QUIÉN pasa por él. Lo
-- que factura un inquilino no es cuenta de su casero.
create or replace function turno_stats_periodo_perfil(p_perfil uuid, p_desde date, p_hasta date)
returns table (ingresos numeric, visitas int, clientes int, ticket numeric)
language plpgsql security definer set search_path to 'public' as $$
begin
  -- Primero si hay alguien; después de quién es. Ver migración 89: `algo <>
  -- turno_uid()` con uid nulo es NULL, no true, y un if NULL deja pasar.
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not exists(select 1 from turno_perfiles where id = p_perfil) then
    raise exception 'perfil inexistente';
  end if;
  if not public.turno_manda_en_la_silla(p_perfil) then
    raise exception 'no autorizado';
  end if;
  return query
  select coalesce(sum(precio_cobrado), 0), count(*)::int,
         count(distinct cliente_id)::int, coalesce(avg(precio_cobrado), 0)
    from turno_historial_visitas
   where perfil_id = p_perfil and fecha between p_desde and p_hasta;
end $$;

comment on function turno_stats_periodo_perfil is
  'Facturación de una silla en un periodo. La lee quien manda en la silla: su '
  'barbero, y la barbería solo si es empleado. Lo que factura un inquilino no '
  'es cuenta de su casero. Ver migraciones 89 y 92.';

grant execute on function turno_stats_periodo_perfil(uuid, date, date) to authenticated;
revoke execute on function turno_stats_periodo_perfil(uuid, date, date) from public, anon;
