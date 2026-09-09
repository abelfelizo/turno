-- UNA CONFIGURACIÓN POR LOCAL
--
-- turno_configuracion_negocio solo tenía primary key sobre id: nada impedía dos
-- filas para el mismo negocio. No ha pasado (comprobado: cero duplicados), pero
-- si pasara sería un fallo silencioso y desagradable de diagnosticar:
--
--   · getConfiguracion usa .maybeSingle(), que revienta con más de una fila;
--   · turno_regla_tiempo leería una cualquiera de las dos, así que la misma
--     pregunta daría respuestas distintas según el plan de la consulta.
--
-- Salió a la luz escribiendo una prueba: el `on conflict (negocio_id)` no tenía
-- a qué agarrarse. Un ON CONFLICT que no compila es una buena señal de que a la
-- tabla le falta la restricción que uno daba por hecha.

create unique index if not exists turno_configuracion_negocio_uniq
  on turno_configuracion_negocio (negocio_id);
