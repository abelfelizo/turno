-- UN DÍA, UNA JORNADA
--
-- Del piloto: "abrí los lunes, pero aparecen dos días abiertos afuera".
--
-- No era la pantalla contando mal. En la base había esto, y se puede ver:
--
--   perfil 019c4c0a… (Pedro · Buen Corte)
--     dia_semana 1 · 09:00–18:00 · activo   <- id 86f9973a…
--     dia_semana 1 · 09:00–18:00 · activo   <- id 778cdced…
--
-- Dos lunes idénticos. La lista de días usa `horarios.find(dia_semana === n)` y
-- enseña el primero, mientras el resumen usa `horarios.filter(activo).length` y
-- cuenta los dos. Las dos leen bien la misma tabla mal poblada.
--
-- CÓMO SE DUPLICA. guardarHorario decide entre insertar y actualizar según si
-- el objeto que tiene la pantalla en memoria trae `id`:
--
--   if (h.id) update ... else insert ...
--
-- Al abrir el cuadro de un día que aún no existe, no hay id, así que se
-- inserta. Si esa pantalla no se ha recargado desde el insert anterior —dos
-- toques seguidos, un guardado antes de que vuelva `cargar()`, la vuelta atrás
-- y entrar otra vez— se inserta de nuevo. La decisión de crear o modificar
-- dependía del estado de un teléfono, y ese es el tipo de cosa que la base
-- tiene que decidir por su cuenta.
--
-- El único índice único de turno_horarios era la clave primaria, o sea `id`,
-- que es distinto en cada fila por definición y por tanto no impedía nada.
--
-- QUÉ HACE ESTA MIGRACIÓN:
--   1. deja una sola fila por (perfil, día) — se conserva la más completa, y a
--      igualdad, la de id menor, para que el resultado no dependa del orden en
--      que Postgres devuelva las filas;
--   2. pone el índice único que faltaba, que además habilita el upsert por
--      (perfil_id, dia_semana) desde la app, de modo que "abrir un día" pase a
--      ser idempotente: repetirlo no crea nada nuevo.

-- 1. Deduplicar. Gana la fila con jornada más larga (la que más se parece a una
--    jornada de verdad); si empatan, la de id menor.
with rank as (
  select id,
         row_number() over (
           partition by perfil_id, dia_semana
           order by (hora_fin - hora_inicio) desc, activo desc, id asc
         ) as n
    from turno_horarios
)
delete from turno_horarios h
 using rank r
 where h.id = r.id and r.n > 1;

-- 2. Que no vuelva a pasar.
create unique index if not exists turno_horarios_perfil_dia_uniq
  on turno_horarios (perfil_id, dia_semana);

comment on index turno_horarios_perfil_dia_uniq is
  'Un día de la semana, una sola jornada por perfil. Sin esto la app podía '
  'insertar el mismo día dos veces —decidía crear o modificar según si su '
  'estado en memoria traía id— y el resumen contaba días que no existían. '
  'También es el índice sobre el que la app hace upsert (perfil_id, dia_semana).';
