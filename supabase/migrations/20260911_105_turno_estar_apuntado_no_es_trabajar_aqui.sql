-- ESTAR APUNTADO NO ES TRABAJAR AQUÍ
--
-- La tercera vez que se arregla la MISMA frase, y esta vez se enumeró la
-- familia entera en vez de esperar al siguiente reporte.
--
-- La 101 la quitó de turno_cola, turno_citas y turno_historial_visitas. La 102,
-- de turno_preferencias_cliente. Al terminar la 102 se corrió por fin la
-- consulta que debió correrse en la 101:
--
--   select tablename, policyname from pg_policies
--    where schemaname='public' and coalesce(qual,'') ~ 'turno_mis_negocios';
--
-- Quedaban QUINCE políticas más. La mayoría están bien: `turno_mis_negocios()`
-- significa «los locales a los que pertenezco, en el rol que sea», y eso es
-- exactamente lo que hace falta para ver la barbería, su configuración, su
-- equipo o tus propias membresías. Un cliente TIENE que ver esas cosas.
--
-- Pero en seis sitios la frase se estaba usando como si dijera «trabajo aquí».
-- No lo dice. Reproducido contra la base, con `set local role authenticated`,
-- siendo un cliente cualquiera recién unido con el código del local:
--
--   insert into turno_puntos (usuario_id, negocio_id, visitas_totales, ...)
--     values (yo, este_local, 99, 0)                              →  ENTRÓ
--   update turno_puntos set visitas_totales = 99 where usuario_id = <otro>
--                                                                 →  1 fila
--   insert into turno_historial_visitas (...) values (...)        →  ENTRÓ
--   select * from turno_puntos  where usuario_id = <otro>         →  1 fila
--   select * from turno_canjes  where usuario_id = <otro>         →  1 vale
--   select metadata from turno_eventos_log                        →  "el dueño
--                                                       cuadró la caja: 4500"
--   insert into turno_eventos_log (...)                           →  ENTRÓ
--   update turno_grupos set total_personas=99 where id=<de otro>  →  1 fila
--   delete from turno_grupos where id = <de otro>                 →  1 fila
--
-- Las tres primeras no son una fuga de datos: son **una vía de fraude**. La
-- tarjeta de fidelidad se escribe sola desde un trigger sobre las visitas, y
-- aquí cualquier cliente podía escribírsela a mano —o inventarse la visita que
-- la alimenta— y canjear el corte gratis sin haber pisado el local. Y la visita
-- falsa además ensucia lo que el barbero cree que facturó.
--
-- ── POR QUÉ NO HABÍA SALTADO NADA ───────────────────────────────────────────
-- Porque la red de `puertas` censa lo que puede hacer un ANÓNIMO, y aquí el
-- intruso es un cliente REGISTRADO del propio local. Es el mismo punto ciego que
-- ya se escribió en la cabecera de puertas para las funciones —«un intruso sin
-- fila en turno_usuarios rebota en el 'no autenticado' genérico»— y que no se
-- había aplicado a las TABLAS. Desde la 101 hay casos «tabla» en la suite; esta
-- migración añade los suyos.
--
-- ── LA REGLA, ESCRITA UNA VEZ ───────────────────────────────────────────────
-- La 101 y la 102 resolvieron esto con un `exists` sobre turno_perfiles escrito
-- a mano, cada una el suyo. Tres copias de la misma pregunta es como empiezan
-- estos fallos, así que aquí se le pone nombre: `turno_trabajo_aqui(negocio)`.
--
-- Exige `aprobado`, no solo `activo`: unirse a un local como profesional es
-- self-service con el mismo código que usa un cliente, y quien no ha sido
-- aceptado todavía no atiende a nadie. Mismo listón que la 102.
--
-- Y donde la fila cuelga de una silla concreta se sigue preguntando por la
-- silla, no por el local: `turno_manda_en_la_silla` (92). En una barbería de
-- asientos alquilados el casero no lee la tarjeta de fidelidad de la clientela
-- de su inquilino, igual que no lee su facturación.
--
-- ── LAS ESCRITURAS QUE SE VAN DEL TODO ──────────────────────────────────────
-- turno_puntos, turno_historial_visitas y turno_eventos_log se quedan SIN
-- política de escritura. No es un descuido: comprobado uno por uno, todo lo que
-- escribe legítimamente en ellas es `SECURITY DEFINER` y por tanto se salta RLS
-- —turno_acumular_puntos, turno_registrar_visita_cola, turno_registrar_visita_cita,
-- turno_emitir_canje, turno_aplicar_canje—. La política no sostenía ninguna
-- escritura real; solo abría la puerta a las falsas.
--
-- turno_eventos_log merece una nota aparte: **no tiene ni un escritor**. Ni una
-- función, ni un trigger, ni una línea de la app, y 0 filas. Su único camino de
-- escritura alcanzable era esta política. No se borra la tabla porque el
-- registro de eventos es algo que este producto va a querer; se deja cerrada
-- hasta que alguien la escriba a propósito.
--
-- Comprobado antes de tocar nada: la app solo LEE puntos, canjes e historial, y
-- no toca eventos_log ni grupos (solo llama a turno_agendar_grupo, que es
-- SECURITY DEFINER). turno_puntos tiene 20 filas del piloto; las otras tres, 0.

-- ── LA PREGUNTA, CON NOMBRE ─────────────────────────────────────────────────
create or replace function public.turno_trabajo_aqui(p_negocio uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.turno_perfiles p
     where p.negocio_id = p_negocio
       and p.usuario_id = public.turno_uid()
       and p.activo
       and p.aprobado);
$$;

revoke execute on function public.turno_trabajo_aqui(uuid) from public, anon;
grant  execute on function public.turno_trabajo_aqui(uuid) to authenticated;

-- ── LA TARJETA DE FIDELIDAD ─────────────────────────────────────────────────
drop policy if exists turno_puntos_select on turno_puntos;
drop policy if exists turno_puntos_write  on turno_puntos;

create policy turno_puntos_select on turno_puntos
  for select using (
    usuario_id = public.turno_uid()
    or (perfil_id is not null and public.turno_manda_en_la_silla(perfil_id))
    or (perfil_id is null     and public.turno_trabajo_aqui(negocio_id))
  );

-- ── LOS VALES ───────────────────────────────────────────────────────────────
drop policy if exists turno_canjes_lectura on turno_canjes;

create policy turno_canjes_lectura on turno_canjes
  for select using (
    usuario_id = public.turno_uid()
    or (perfil_id is not null and public.turno_manda_en_la_silla(perfil_id))
    or (perfil_id is null     and public.turno_trabajo_aqui(negocio_id))
  );

-- ── EL HISTORIAL: LEER YA LO ARREGLÓ LA 101; FALTABA ESCRIBIR ───────────────
drop policy if exists turno_historial_insert on turno_historial_visitas;

-- ── EL REGISTRO DEL LOCAL ───────────────────────────────────────────────────
drop policy if exists turno_eventos_select on turno_eventos_log;
drop policy if exists turno_eventos_insert on turno_eventos_log;

create policy turno_eventos_select on turno_eventos_log
  for select using (
    (perfil_id is not null and public.turno_manda_en_la_silla(perfil_id))
    or (perfil_id is null  and public.turno_trabajo_aqui(negocio_id))
  );

-- ── LOS GRUPOS ──────────────────────────────────────────────────────────────
drop policy if exists turno_grupos_select on turno_grupos;
drop policy if exists turno_grupos_write  on turno_grupos;

create policy turno_grupos_select on turno_grupos
  for select using (
    lider_id = public.turno_uid()
    or (perfil_id is not null and public.turno_manda_en_la_silla(perfil_id))
    or (perfil_id is null     and public.turno_trabajo_aqui(negocio_id))
  );

-- Escribir un grupo es cosa de quien lo lidera o de quien manda en esa silla.
-- Pertenecer al local no basta: era justo lo que dejaba a un cliente borrarle
-- el grupo de cuatro a otro.
create policy turno_grupos_write on turno_grupos
  for all
  using (
    lider_id = public.turno_uid()
    or (perfil_id is not null and public.turno_manda_en_la_silla(perfil_id))
  )
  with check (
    lider_id = public.turno_uid()
    or (perfil_id is not null and public.turno_manda_en_la_silla(perfil_id))
  );
