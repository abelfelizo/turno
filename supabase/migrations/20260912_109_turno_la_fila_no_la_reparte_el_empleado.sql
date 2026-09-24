-- LA FILA NO LA REPARTE EL EMPLEADO
--
-- La regla, tal y como la escribió el dueño del producto:
--
--   «No gestiona fila, solo puede gestionar al turno del momento.»
--
-- La 107 puso porteros en las tres funciones que DAN trabajo —llamar al
-- siguiente, llamar a uno concreto, sentar a un walk-in— y con eso el empleado
-- sin permiso ya no se sirve solo. Pero «gestionar la fila» no es solo darse
-- trabajo: también es quitárselo a otro y decidir quién entra en su lugar.
--
-- Enumerada la familia entera, que es la lección de la 102 —al arreglar una
-- familia se enumera la familia, no los casos del reporte—. Todas las
-- operaciones sobre un turno pasan por `turno_cola_operable`, así que la lista
-- es cerrada y se puede leer de la base:
--
--   turno_llamar_a          · da trabajo     → cerrada en la 107
--   turno_llamar_siguiente  · da trabajo     → cerrada en la 107
--   turno_atender_sin_cita  · da trabajo     → cerrada en la 107
--   turno_sacar_de_cola     · REPARTE        → ABIERTA  ← esta migración
--   turno_sustituir_ausente · REPARTE        → ABIERTA  ← esta migración
--   turno_mover_en_cola     · repartiría, pero rebota siempre desde que el
--                             orden de la fila dejó de ser una sugerencia
--   turno_devolver_a_fila   · el que tiene delante  → es SUYO, no se toca
--   turno_iniciar_atencion  · el que tiene delante  → es SUYO, no se toca
--   turno_no_esta           · solo sobre 'llamado'  → es SUYO, no se toca
--   turno_dar_mas_tiempo    · solo sobre 'llamado'  → es SUYO, no se toca
--
-- Lo comprobado contra la base antes de escribir nada: un empleado corriente,
-- sin `acepta_por_su_cuenta`, sacaba de la fila a alguien que estaba esperando.
-- `turno_sacar_de_cola` solo se pregunta «¿es de mi silla?», y un turno que le
-- asignaron a él lo es. Le cuesta un cliente al local y el local no se entera:
-- el turno queda 'abandonado', que es lo mismo que escribe el cliente que se
-- va por su pie.
--
-- ── LO QUE NO SE TOCA, Y POR QUÉ ────────────────────────────────────────────
-- `turno_cambiar_servicio` se queda abierta a propósito. Cambiar «corte» por
-- «corte y barba» no decide a quién se atiende ni en qué orden: es corregir un
-- dato que el cliente acaba de dar. Cierto que cambia la duración y con ella el
-- ETA de los de atrás, pero cerrarla obligaría a llamar al dueño para cada
-- «hazme también la barba» — y la regla habla de repartir el trabajo, no de
-- escribir lo que pidió quien ya está apuntado. **Cerrar de más también es
-- incumplir la regla**, solo que por el otro lado.
--
-- ── DÓNDE VIVE LA REGLA ─────────────────────────────────────────────────────
-- En una función, no repetida en dos. `turno_manda_en_la_fila(negocio)` es la
-- pregunta del LOCAL —«¿repartes tú esta fila?»— y `turno_capta_por_su_cuenta`
-- sigue siendo la de la SILLA —«¿puede esta silla servirse sola?»—. La primera
-- se apoya en la segunda: no son dos reglas parecidas, es una dentro de otra.
--
-- Y no va dentro de `turno_cola_operable`, que sería el sitio obvio. Si fuera
-- allí, `turno_llamar_a` rebotaría con este mensaje y perdería el suyo, que es
-- el único que le dice al barbero QUÉ PEDIR: «pide que te activen aceptar
-- clientes por mi cuenta». Un portero que niega sin decir cómo se entra manda
-- al usuario a soporte.

create or replace function public.turno_manda_en_la_fila(p_negocio uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_negocio in (select public.turno_negocios_admin())
      or exists (
           select 1 from public.turno_perfiles p
            where p.negocio_id = p_negocio
              and p.usuario_id = public.turno_uid()
              and p.activo and p.aprobado
              and public.turno_capta_por_su_cuenta(p.id));
$$;

revoke execute on function public.turno_manda_en_la_fila(uuid) from public, anon;
grant  execute on function public.turno_manda_en_la_fila(uuid) to authenticated;

-- SACAR DE LA FILA. Cuerpo real de la base, con el portero nuevo metido
-- DESPUÉS de los que ya había: primero «¿existe y está abierto?», luego «¿es de
-- tu silla?», y solo al final la pregunta nueva. Así el que se equivoca de
-- turno sigue leyendo por qué, en vez de que le contesten otra cosa.
--
-- Solo muerde sobre 'en_fila'. Al que está llamado o sentado se le saca
-- igual: ese es el turno del momento, y si se levantó y se fue el barbero
-- tiene que poder cerrarlo — si no, la silla se le queda ocupada por alguien
-- que no está.
create or replace function public.turno_sacar_de_cola(p_cola uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v public.turno_cola;
begin
  v := public.turno_cola_operable(p_cola);
  if v.estado not in ('en_fila','llamado','en_camino','atendiendo') then
    raise exception 'ese turno ya está cerrado';
  end if;

  if v.perfil_id is not null and not public.turno_es_mi_perfil(v.perfil_id) then
    raise exception 'esa fila la maneja el barbero que atiende esa silla';
  end if;

  if v.estado = 'en_fila' and not public.turno_manda_en_la_fila(v.negocio_id) then
    raise exception 'la fila la reparte la barbería: tú manejas el turno que tengas delante';
  end if;

  update turno_cola set estado = 'abandonado' where id = p_cola;
end $$;

-- SUSTITUIR AL AUSENTE. Es la más clara de las dos: no cierra un turno, ELIGE
-- quién se lleva el hueco del que no apareció. Eso es repartir, y se pregunta
-- una sola vez, arriba, antes de mover nada.
create or replace function public.turno_sustituir_ausente(p_ausente uuid, p_sustituto uuid)
returns turno_cola
language plpgsql
security definer
set search_path = public
as $$
declare v_aus public.turno_cola; v_sus public.turno_cola; v_primero uuid;
begin
  v_aus := public.turno_cola_operable(p_ausente);
  v_sus := public.turno_cola_operable(p_sustituto);

  if v_aus.id = v_sus.id then raise exception 'no puede sustituirse a sí mismo'; end if;
  if v_aus.negocio_id <> v_sus.negocio_id then raise exception 'son de locales distintos'; end if;

  if not public.turno_manda_en_la_fila(v_aus.negocio_id) then
    raise exception 'quién entra en lugar del ausente lo decide la barbería';
  end if;

  if v_aus.estado not in ('llamado', 'en_camino') then
    raise exception 'primero llámalo: solo se sustituye a quien ya tuvo su turno';
  end if;

  select q.id into v_primero
    from turno_cola q
   where q.negocio_id = v_aus.negocio_id
     and q.estado in ('en_fila', 'llamado', 'en_camino')
     and (v_aus.perfil_id is null or q.perfil_id is null or q.perfil_id = v_aus.perfil_id)
   order by q.prioridad asc, q.posicion asc
   limit 1;
  if v_primero is distinct from p_ausente then
    raise exception 'ese no es el turno que toca ahora';
  end if;

  if v_sus.tipo_cola <> 'fisica' then
    raise exception 'solo puede sustituir alguien que esté en el local';
  end if;
  if v_sus.estado <> 'en_fila' then
    raise exception 'ese turno ya no está esperando';
  end if;

  update turno_cola set estado = 'expirado', expira_at = now() where id = p_ausente;

  update turno_cola
     set prioridad = v_aus.prioridad,
         posicion  = v_aus.posicion,
         perfil_id = coalesce(v_sus.perfil_id, v_aus.perfil_id)
   where id = p_sustituto
   returning * into v_sus;

  return v_sus;
end $$;
