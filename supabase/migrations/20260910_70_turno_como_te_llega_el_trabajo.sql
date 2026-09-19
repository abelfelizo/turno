-- CÓMO TE LLEGA EL TRABAJO
--
-- Del piloto: "pensé en botones que definan qué tipo de cola se acepta, así si
-- le simplifica a algunos barberos".
--
-- Hay tres formas de que alguien llegue a la silla, y hoy las tres están
-- encendidas siempre:
--
--   · CITA · reserva una hora concreta con antelación.
--   · FILA · se mete en la cola desde el teléfono y espera su turno.
--   · SIN CITA · aparece por la puerta y el barbero lo sienta.
--
-- Pero no todos los barberos trabajan así. Uno de barrio no usa citas en su
-- vida: llegas, esperas, te cortas. Otro solo trabaja con hora y no quiere gente
-- sentada esperando. Obligar a los dos a llevar el sistema completo es pedirles
-- que administren algo que no usan — y peor, es prometerle al cliente una vía
-- que ese barbero no piensa atender.
--
-- DÓNDE SE ENGANCHA. Resulta que la pieza ya existía y no hacía falta inventar
-- nada. turno_perfil_acepta(perfil, fecha) ya distingue las dos preguntas por el
-- segundo argumento:
--
--     p_fecha IS NULL      -> "¿acepta gente en la fila AHORA?"
--     p_fecha IS NOT NULL  -> "¿acepta reservas para ese día?"
--
-- Y los tres sitios que la llaman ya lo hacían bien, comprobado uno por uno:
-- turno_entrar_a_cola pasa null, turno_slots_disponibles y turno_agendar_cita
-- pasan la fecha. Así que basta con enseñarle a esta función el modo y las tres
-- puertas quedan cerradas a la vez, sin tocarlas.
--
-- POR QUÉ UN CAMPO CON TRES VALORES Y NO DOS INTERRUPTORES. Dos booleanos dejan
-- construir "no acepto citas y no acepto fila", que no es un modo de trabajo:
-- es estar cerrado, y para eso ya está el estado 'inactivo'. Un estado imposible
-- que la interfaz tiene que impedir es un estado que alguien acabará creando.
--
-- EL SIN CITA SIGUE FUNCIONANDO EN LOS TRES MODOS, y es deliberado. No es una
-- vía que el cliente use: es el barbero sentando a quien tiene delante. Un
-- barbero "solo citas" con un hueco y alguien en la puerta lo va a atender, y
-- que la app se lo impida sería decirle cómo trabajar en su propia silla.
--
-- QUIÉN LO DECIDE: el barbero, con la misma política que ya gobierna
-- estado_actual (usuario_id = turno_uid() OR admin del local). Es una decisión
-- operativa sobre su silla, no comercial: no toca precios ni horarios, que en
-- un local de empleados sí son del dueño (migración 55).

alter table turno_perfiles
  add column if not exists modo_atencion text not null default 'ambos';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'turno_perfiles_modo_atencion_chk') then
    alter table turno_perfiles
      add constraint turno_perfiles_modo_atencion_chk
      check (modo_atencion in ('ambos', 'solo_citas', 'solo_fila'));
  end if;
end $$;

comment on column turno_perfiles.modo_atencion is
  'Por dónde acepta trabajo este barbero: ambos | solo_citas | solo_fila. '
  'Lo lee turno_perfil_acepta, que ya distinguía fila (fecha NULL) de agenda '
  '(fecha dada), así que cierra a la vez la entrada a la fila, la lista de '
  'huecos y la reserva. NO afecta a turno_atender_sin_cita: eso es el barbero '
  'sentando a quien tiene delante, no una vía que el cliente elija.';

create or replace function turno_perfil_acepta(p_perfil uuid, p_fecha date default null)
returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare v_est text; v_modo text;
begin
  if p_perfil is null then return true; end if;

  select coalesce(pr.estado_actual, 'disponible'), coalesce(pr.modo_atencion, 'ambos')
    into v_est, v_modo
    from turno_perfiles pr
   where pr.id = p_perfil and pr.activo and pr.aprobado;
  if v_est is null then return false; end if;

  if v_est = 'inactivo' then return false; end if;

  -- El descanso es de HOY (migración 56): cierra la fila viva, no la agenda.
  -- Escrito como salida temprana y no como `return p_fecha is not null`, que es
  -- lo que había: aquel return se llevaba por delante las comprobaciones de
  -- abajo, y un barbero en descanso habría aceptado citas aunque su modo fuera
  -- 'solo_fila'.
  if v_est = 'descanso' and p_fecha is null then return false; end if;

  -- Y el modo, que se aplica siempre.
  if p_fecha is null and v_modo = 'solo_citas' then return false; end if;
  if p_fecha is not null and v_modo = 'solo_fila' then return false; end if;

  return true;
end $$;
