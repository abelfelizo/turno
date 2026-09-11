-- LA RED SE CUENTA SOLA
--
-- La red anti-anónimos de `puertas.test.sql` es una lista escrita a mano, y las
-- listas escritas a mano se pudren. El repo lo sabe —está escrito en el README
-- de las pruebas: «toda función nueva se añade a esa red el mismo día que se
-- escribe»— y aun así, al ir a añadir UNA función que se me había quedado
-- fuera (turno_manda_en_el_horario, migración 88), el censo contra pg_proc
-- devolvió DIECIOCHO que la red nunca ha llamado.
--
-- Una regla que depende de que yo me acuerde no es una regla. Así que esta
-- migración no solo tapa los agujeros: la prueba que la acompaña ENUMERA
-- pg_proc y se pone roja sola cuando aparece una función turno_* que un
-- anónimo puede ejecutar y que la red no nombra. La próxima vez no hará falta
-- que nadie se acuerde.
--
-- ── POR QUÉ HABÍA TANTAS ────────────────────────────────────────────────────
-- Casi ninguna se "abrió" a propósito. En Postgres, PUBLIC tiene EXECUTE por
-- defecto sobre toda función nueva, y `anon` hereda de PUBLIC. Un
--
--     grant execute on function f(...) to authenticated;
--
-- sin su `revoke ... from public, anon` al lado no cierra nada: solo repite en
-- voz alta un permiso que ya estaba puesto. Por eso la defensa de verdad no es
-- el grant, es el portero DENTRO de la función — y por eso la red llama, no lee.
--
-- ── LO QUE APARECIÓ AL LLAMARLAS ────────────────────────────────────────────
-- De las dieciocho: ocho ya se negaban de verdad, seis son ayudantes de
-- políticas RLS y de CHECK que TIENEN que seguir siendo ejecutables por anon
-- —quitarles el permiso hace que la política reviente con "permission denied"
-- en vez de devolver false, que es peor—, una estaba MUERTA, y tres estaban
-- abiertas. Dos de esas tres se parecen a lo ya conocido. La tercera no.
--
-- Y un aviso para el que venga: probar estas cosas con uuids de ceros da falsa
-- tranquilidad. turno_stats_periodo_perfil rebotaba con "perfil inexistente"
-- ante un uuid inventado y parecía cerrada; con el id de una silla REAL soltó
-- la facturación. El portero hay que probarlo con la puerta que de verdad
-- existe.
--
--   · turno_mis_tarjetas   → `if v_uid is null then return; end if;`
--     Es EXACTAMENTE el caso de la migración 84. Devolver vacío no es negarse:
--     se parecen mientras la consulta funcione, y el día que el filtro
--     `t.usuario_id = v_uid` se caiga, una sigue en silencio y la otra se pone
--     roja. La 84 arregló cuatro funciones con esta forma y esta se le escapó.
--
--   · turno_negocio_por_codigo → sin portero ninguno.
--     Esta es la que importa. La migración 57 cerró turno_negocios porque «los
--     códigos son privados» y dejó esta función como única puerta: se puede
--     PREGUNTAR por un código, no se puede LISTAR la tabla. Pero preguntar sin
--     identificarse, con la llave anon que viaja dentro del APK, y con códigos
--     de seis caracteres, no es preguntar: es listar despacio. Devolvía nombre,
--     tipo y moneda de cualquier local a cualquiera.
--
--     Y no hace falta que sea pública. La única pantalla que la llama
--     —`(auth)/barbero-codigo`, y su gemela de cliente— se alcanza desde
--     `welcome`, y a `welcome` solo se llega con sesión: `app/index.tsx` manda
--     a login si `getAuthSession()` viene vacío. El onboarding de Turno ocurre
--     DESPUÉS del OTP, no antes. Pedir sesión aquí no rompe ningún camino.
--
--   · turno_stats_periodo_perfil → ESTA ES LA GRANDE, y no es un descuido de
--     portero: es lógica de tres valores.
--
--         if v_dueno <> public.turno_uid()
--            and not (v_neg in (select public.turno_negocios_admin())) then
--           raise exception 'no autorizado';
--         end if;
--
--     Parece un portero y lo es —para un intruso REGISTRADO. Pero si no hay
--     nadie, turno_uid() es null, y `v_dueno <> null` no es `true`: es NULL.
--     `NULL and true` es NULL, y un `if NULL` no entra. El portero no dice
--     "no": se queda callado y deja pasar.
--
--     Comprobado contra la base real: un anónimo pidiendo el periodo completo
--     de una silla existente recibió ingresos, visitas, clientes y ticket
--     medio. Con la llave anon que viaja dentro del APK y un uuid de perfil,
--     cualquiera leía la facturación de cualquier barbero.
--
--     La lección va más allá de esta función: comparar contra turno_uid() con
--     `<>` NO es comprobar que hay sesión. Primero se pregunta si hay alguien;
--     después se compara. Es el único sitio del esquema con esta forma —se
--     buscó— pero queda escrito aquí para que no vuelva a escribirse.
--
-- ── Y LA QUE ESTABA MUERTA ──────────────────────────────────────────────────
-- turno_siguiente_adelantado no está en NINGUNA migración de este repo: se
-- creó a mano en el panel y nunca entró al historial. Lee `q.promesa_at`, una
-- columna que turno_cola no tiene y que no aparece en ninguna migración, así
-- que lleva desde siempre reventando con "column q.promesa_at does not exist"
-- para todo el mundo. La app no la llama desde ningún sitio.
--
-- La red la habría dado por buena: se niega. Pero se niega porque está rota,
-- que es la peor forma de pasar una prueba. Se borra. Su cuerpo, por si algún
-- día se quiere rehacer la idea (avisar del siguiente de la fila que prometió
-- llegar antes), era:
--
--   select q.id, q.cliente_id, u.nombre,
--          case when q.promesa_at is null then null
--               else greatest(0, ceil(extract(epoch from (q.promesa_at - now())) / 60))::int end
--     from turno_cola q join turno_usuarios u on u.id = q.cliente_id
--    where q.negocio_id = p_negocio and q.estado = 'en_fila'
--      and (p_perfil is null or q.perfil_id is null or q.perfil_id = p_perfil)
--      and q.negocio_id in (select public.turno_mis_negocios())
--    order by q.prioridad asc, q.posicion asc limit 1
--
-- Hoy ese aviso ya existe y funciona: turno_avisos_de_espera, y el tiempo
-- prometido vive en `en_camino_at`, no en una columna que nunca se creó.

-- ── TURNO_MIS_TARJETAS: LA QUINTA QUE DEVOLVÍA VACÍO ────────────────────────
create or replace function turno_mis_tarjetas(p_negocio uuid)
returns table (perfil_id uuid, barbero text, visitas int, meta int, premio text, ambito text)
language plpgsql stable security definer set search_path to 'public' as $$
declare v_uid uuid := public.turno_uid();
begin
  -- Antes: `if v_uid is null then return; end if;`. Ver migración 84.
  if v_uid is null then raise exception 'no autenticado'; end if;
  return query
  select t.perfil_id,
         u.nombre,
         (coalesce(t.visitas_totales,0) - coalesce(t.visitas_canjeadas,0))::int,
         f.meta, f.premio, f.ambito
    from turno_puntos t
    left join turno_perfiles pf on pf.id = t.perfil_id
    left join turno_usuarios u on u.id = pf.usuario_id
    cross join lateral public.turno_fidelidad(t.perfil_id, t.negocio_id) f
   where t.usuario_id = v_uid and t.negocio_id = p_negocio and f.activo
   order by 3 desc;
end $$;

comment on function turno_mis_tarjetas is
  'Las tarjetas de fidelidad del que llama en un local. Pide sesión: devolver '
  'vacío no es negarse (migraciones 84 y 89).';

grant execute on function turno_mis_tarjetas(uuid) to authenticated;
revoke execute on function turno_mis_tarjetas(uuid) from public, anon;

-- ── TURNO_NEGOCIO_POR_CODIGO: PREGUNTAR SÍ, PERO CON NOMBRE ─────────────────
-- Pasa de `language sql` a plpgsql por la misma razón que turno_mi_preferido en
-- la 84: en SQL puro no hay dónde poner el portero.
create or replace function turno_negocio_por_codigo(p_codigo text)
returns table (id uuid, nombre text, tipo text, moneda text)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  return query
  select n.id, n.nombre, n.tipo, n.moneda
    from turno_negocios n
   where n.codigo_acceso = upper(btrim(p_codigo)) and n.activo
   limit 1;
end $$;

comment on function turno_negocio_por_codigo is
  'Resuelve UN código de local. Se puede preguntar; no se puede listar — y '
  'ahora hay que estar registrado para preguntar, porque con la llave anon del '
  'APK y seis caracteres, preguntar sin identificarse es listar despacio. '
  'Ver migraciones 57 y 89.';

grant execute on function turno_negocio_por_codigo(text) to authenticated;
revoke execute on function turno_negocio_por_codigo(text) from public, anon;

-- ── TURNO_STATS_PERIODO_PERFIL: PRIMERO ¿HAY ALGUIEN?, DESPUÉS ¿ERES TÚ? ────
create or replace function turno_stats_periodo_perfil(p_perfil uuid, p_desde date, p_hasta date)
returns table (ingresos numeric, visitas int, clientes int, ticket numeric)
language plpgsql security definer set search_path to 'public' as $$
declare v_neg uuid; v_dueno uuid; v_uid uuid := public.turno_uid();
begin
  -- Sin esta línea, el `<>` de abajo es NULL y el if no entra. Ver cabecera.
  if v_uid is null then raise exception 'no autenticado'; end if;
  select negocio_id, usuario_id into v_neg, v_dueno from turno_perfiles where id = p_perfil;
  if v_neg is null then raise exception 'perfil inexistente'; end if;
  if v_dueno <> v_uid and not (v_neg in (select public.turno_negocios_admin())) then
    raise exception 'no autorizado';
  end if;
  return query
  select coalesce(sum(precio_cobrado), 0), count(*)::int,
         count(distinct cliente_id)::int, coalesce(avg(precio_cobrado), 0)
    from turno_historial_visitas
   where perfil_id = p_perfil and fecha between p_desde and p_hasta;
end $$;

comment on function turno_stats_periodo_perfil is
  'Facturación de una silla en un periodo. La lee su barbero o el dueño del '
  'local. Pide sesión ANTES de comparar: `algo <> turno_uid()` con uid nulo es '
  'NULL, no true, y un if NULL deja pasar. Ver migración 89.';

grant execute on function turno_stats_periodo_perfil(uuid, date, date) to authenticated;
revoke execute on function turno_stats_periodo_perfil(uuid, date, date) from public, anon;

-- ── LA MUERTA SE ENTIERRA ───────────────────────────────────────────────────
drop function if exists turno_siguiente_adelantado(uuid, uuid);

-- ── Y LAS QUE YA SE NEGABAN, CERRADAS TAMBIÉN POR PERMISO ───────────────────
-- Tienen portero y se niegan bien; esto es el segundo cerrojo. Que una función
-- se defienda sola no es razón para dejarle la puerta abierta: la red las llama
-- a todas desde hoy, pero el permiso no depende de que nadie corra la prueba.
revoke execute on function turno_agendar_grupo(uuid, uuid, date, time, int)   from public, anon;
revoke execute on function turno_aplicar_canje(uuid)                          from public, anon;
revoke execute on function turno_dejar_local(uuid)                            from public, anon;
revoke execute on function turno_eliminar_cuenta()                            from public, anon;
revoke execute on function turno_emitir_canje(uuid, uuid)                     from public, anon;
revoke execute on function turno_llamar_a(uuid)                               from public, anon;
revoke execute on function turno_salir_local(uuid)                            from public, anon;

-- turno_cola_operable NO se toca: aparece dentro de funciones SECURITY DEFINER
-- y, como los demás ayudantes de porteros, quitarle el permiso cambiaría un
-- "no es tuyo" limpio por un "permission denied" en mitad de otra cosa.
-- Los seis ayudantes de políticas y CHECK —perfil_admin, perfil_autonomo,
-- perfil_operable, perfil_acepta, puede_confirmar, codigo_prefijo— tampoco, y
-- por la razón que ya está escrita en supabase/tests/README.md: los ayudantes
-- que viven DENTRO de una política se evalúan con el rol de quien consulta.
