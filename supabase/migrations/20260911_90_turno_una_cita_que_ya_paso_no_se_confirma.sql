-- UNA CITA QUE YA PASÓ NO SE CONFIRMA
--
-- Viene de revisar la tarjeta de estado del CLIENTE, que era el lado que
-- quedaba. El reporte original era del lado del barbero —«programo la cita, no
-- confirmo y no llego, mi cita se queda ahí con los mismos botones como si
-- estuviera activa»— y en el cliente pasaba lo mismo, con el agravante de que
-- ahí los botones ESCRIBEN.
--
-- La pantalla ya no los enseña. Pero este repo tiene una regla sobre eso:
--
--   «Una regla que solo vive en la interfaz no es una regla.»
--
-- El trigger turno_cita_escritura_del_cliente decía, para quien no es del
-- equipo:
--
--     if new.estado is distinct from old.estado
--        and new.estado not in ('confirmada','en_camino','cancelada') then
--       raise exception 'esa parte de la cita la cierra el barbero';
--     end if;
--
-- Correcto en QUÉ puede escribir el cliente, mudo en CUÁNDO. Así que un cliente
-- podía, sobre una cita del martes pasado:
--
--   · CONFIRMARLA. El barbero abre su agenda y ve una cita vieja en verde, como
--     si el cliente fuera a aparecer. La confirmación es una promesa de venir; a
--     toro pasado no significa nada y encima desinforma.
--   · Ponerse EN CAMINO. Lo mismo pero peor: es la señal de "estoy llegando".
--   · CANCELARLA — y la app, al cancelar, le manda un push al barbero. Un aviso
--     de que se cancela algo que ya no iba a ocurrir.
--
-- Ninguna de las tres es un agujero de seguridad: la cita es suya. Son ruido
-- metido en la agenda de otro, que es lo que esta app existe para evitar.
--
-- DÓNDE VA LA LÍNEA. En `hora_fin`, y en la hora DEL LOCAL. Mientras la cita no
-- ha terminado el cliente manda sobre ella: puede confirmar, decir que va en
-- camino y cancelar hasta el último minuto —cancelar tarde es feo, pero es
-- verdad, y saberlo le sirve al barbero más que no saberlo—. Pasada `hora_fin`
-- ya no hay nada que el cliente pueda decir: quien cierra es el barbero, con
-- "atendida" o "no llegó", que es exactamente lo que la tarjeta nueva le explica.
--
-- OJO CON LA HORA, que en este repo ya costó dos veces: `current_date` y `now()`
-- pelados son UTC, y el local vive en America/Santo_Domingo (UTC−4). Después de
-- las 20:00 de allá, UTC ya es el día siguiente. Se lee la tz del negocio, igual
-- que turno_fila_abierta y turno_alargar_jornada.
--
-- Y DOS PUERTAS QUE NO SE TOCAN, las dos a propósito:
--   · El BARBERO y el dueño salen antes por `v_staff`: tienen que poder cerrar
--     citas viejas, que es justo como se marcan 'atendida' y 'no_llego'.
--   · El CRON sale antes todavía, en el `turno_uid() is null` de la primera
--     línea. turno_cerrar_citas_viejas corre de madrugada SIN SESIÓN y su
--     trabajo es precisamente tocar citas pasadas. La migración 73 tumbó el
--     mantenimiento nocturno entero por olvidar esto; aquí está por escrito.

create or replace function turno_cita_escritura_del_cliente()
returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_staff boolean; v_tz text; v_fin timestamp;
begin
  -- El cron. Sin sesión no hay a quién pedirle cuentas, y su trabajo es
  -- justamente cerrar lo viejo. Ver migraciones 73 y 75.
  if public.turno_uid() is null then return new; end if;

  v_staff := public.turno_es_mi_perfil(new.perfil_id)
          or (new.negocio_id in (select public.turno_negocios_admin()));
  if v_staff then return new; end if;

  if new.estado is distinct from old.estado
     and new.estado not in ('confirmada', 'en_camino', 'cancelada') then
    raise exception 'esa parte de la cita la cierra el barbero';
  end if;

  if new.atendida_at is distinct from old.atendida_at then
    raise exception 'esa parte de la cita la cierra el barbero';
  end if;

  -- Y el CUÁNDO, que es lo que faltaba. Solo se mira cuando el cliente intenta
  -- mover algo: un update que no toca el estado (una nota, por ejemplo) no
  -- tiene por qué caducar.
  if new.estado is distinct from old.estado then
    select coalesce(n.tz, 'America/Santo_Domingo') into v_tz
      from turno_negocios n where n.id = new.negocio_id;
    v_fin := (old.fecha + coalesce(old.hora_fin, old.hora_inicio))::timestamp;
    if v_fin < (now() at time zone coalesce(v_tz, 'America/Santo_Domingo')) then
      raise exception 'esa cita ya pasó: ahora la cierra el barbero';
    end if;
  end if;

  return new;
end $$;

comment on function turno_cita_escritura_del_cliente is
  'Qué puede escribir el cliente en SU cita, y hasta cuándo. Confirmar, decir '
  'que va en camino y cancelar, sí — hasta hora_fin, en la hora del local. '
  'Pasada esa hora la cierra el barbero (atendida / no llegó). El equipo y el '
  'cron salen antes. Ver migraciones 73, 75 y 90.';
