-- NO SOLO SE CORTA EL PELO
--
-- De las reglas nuevas: «el onboarding pide definición de cliente, barbero,
-- manicurista y/o pedicurista, masajista o la que da facial».
--
-- La base admitía exactamente dos oficios:
--
--   CHECK (tipo_servicio in ('barbero', 'manicuri_pedicuri'))
--
-- así que masajista y facial no es que faltaran en una pantalla: **no se podían
-- guardar**. Un `insert` con 'masajista' rebota contra el CHECK, y la pantalla
-- que lo ofreciera daría un error crudo de Postgres.
--
-- `manicuri_pedicuri` se queda como está, con su nombre feo y todo. La regla
-- dice «manicurista **y/o** pedicurista», que es un solo oficio que puede hacer
-- las dos cosas — exactamente lo que ese valor significa hoy. Separarlo en dos
-- sería otra decisión, y además obligaría a poder marcar DOS oficios en un
-- mismo perfil, que hoy no se puede (la columna es un texto, no una lista).
-- Si hace falta, se hace aparte y con su motivo escrito.
--
-- No hace falta migrar datos: se añaden valores, no se quita ninguno, así que
-- las filas que ya existen siguen siendo válidas.
--
-- ── LO QUE ESTO ENCIENDE SOLO, Y ES BUENO ───────────────────────────────────
-- `turno_cola` tiene SU PROPIO `tipo_servicio` (el del turno, no el del
-- profesional) y sobre él va la regla «un turno por tipo a la vez». Al haber
-- cuatro oficios en vez de dos, esa regla pasa a permitir que alguien esté a la
-- vez en la fila del barbero y en la de la masajista, sin tocar el motor. Es el
-- comportamiento que se quiere en un local que ofrece varias cosas.
--
-- Esa columna no tiene CHECK y se queda sin él a propósito: el tipo del TURNO
-- se copia del perfil que lo atiende, así que el CHECK de aquí ya lo gobierna.

alter table turno_perfiles
  drop constraint if exists turno_perfiles_tipo_servicio_check;

alter table turno_perfiles
  add constraint turno_perfiles_tipo_servicio_check
  check (tipo_servicio in ('barbero', 'manicuri_pedicuri', 'masajista', 'facial'));
