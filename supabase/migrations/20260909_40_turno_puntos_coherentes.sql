-- PUNTOS ACTIVOS SIN CONFIGURAR: UN INTERRUPTOR QUE NO HACÍA NADA
--
-- Reportado en el piloto: "los puntos de fidelidad no se actualizaron en el
-- cliente". El motivo, con los datos delante:
--
--   Buen Corte → puntos_activos = true, puntos_por_visita = NULL
--
-- El trigger turno_acumular_puntos exige `coalesce(puntos_por_visita, 0) > 0`,
-- así que no sumaba nada. Y turno_emitir_canje respondía "este local no tiene
-- puntos configurados". El dueño había encendido el sistema y no pasaba nada,
-- porque la app del dueño tiene el interruptor pero NO tiene dónde escribir
-- cuántos puntos da una visita ni cuántas visitas valen el premio (el barbero
-- rentado sí los tiene; el dueño no).
--
-- Se arregla en los dos lados: aquí la invariante —activo implica configurado—
-- y en la app los controles que faltaban.
--
-- Se elige un trigger y no un DEFAULT de columna porque el DEFAULT no cubre un
-- UPDATE que enciende el interruptor, que es justo el caso que falló.

create or replace function turno_puntos_coherentes()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if coalesce(NEW.puntos_activos, false) then
    -- Valores de arranque conservadores: 1 punto por visita y premio a las 8.
    -- El dueño los ajusta desde su configuración; lo que no puede pasar es que
    -- el sistema quede encendido y en silencio.
    NEW.puntos_por_visita  := coalesce(nullif(NEW.puntos_por_visita, 0), 1);
    NEW.visitas_para_gratis := coalesce(nullif(NEW.visitas_para_gratis, 0), 8);
  end if;
  return NEW;
end $$;

drop trigger if exists trg_turno_puntos_coherentes on turno_configuracion_negocio;
create trigger trg_turno_puntos_coherentes
  before insert or update on turno_configuracion_negocio
  for each row execute function turno_puntos_coherentes();

-- Misma invariante para el barbero que lleva sus propios puntos (R6).
create or replace function turno_puntos_perfil_coherentes()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if coalesce(NEW.puntos_activos, false) then
    NEW.puntos_por_visita := coalesce(nullif(NEW.puntos_por_visita, 0), 1);
    NEW.puntos_meta       := coalesce(nullif(NEW.puntos_meta, 0), 8);
  end if;
  return NEW;
end $$;

drop trigger if exists trg_turno_puntos_perfil on turno_perfiles;
create trigger trg_turno_puntos_perfil
  before insert or update on turno_perfiles
  for each row execute function turno_puntos_perfil_coherentes();

-- Los locales que ya estaban en este estado (Buen Corte entre ellos).
update turno_configuracion_negocio
   set puntos_por_visita = coalesce(nullif(puntos_por_visita, 0), 1),
       visitas_para_gratis = coalesce(nullif(visitas_para_gratis, 0), 8)
 where puntos_activos;

update turno_perfiles
   set puntos_por_visita = coalesce(nullif(puntos_por_visita, 0), 1),
       puntos_meta = coalesce(nullif(puntos_meta, 0), 8)
 where puntos_activos;
