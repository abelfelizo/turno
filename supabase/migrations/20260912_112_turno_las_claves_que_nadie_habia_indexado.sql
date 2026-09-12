-- LAS CLAVES QUE NADIE HABÍA INDEXADO
--
-- Treinta y nueve claves foráneas de tablas `turno_` sin un índice que las
-- cubra. Sacadas del catálogo (`pg_constraint` cruzado con `pg_index`), no del
-- texto del linter: así la lista es la de HOY y no la de cuando se escribió el
-- aviso.
--
-- Por qué importa aquí más que en una app normal, que es lo que hace que esto
-- no sea una micro-optimización:
--
--   1. **Cada política RLS hace estas búsquedas POR FILA.** `turno_cola`,
--      `turno_citas` y `turno_historial_visitas` se leen con predicados que
--      llaman a `turno_manda_en_la_silla(perfil_id)` y compañía, y eso mira
--      `turno_perfiles` por `id` y por `negocio_id`. Sin índice, cada fila
--      devuelta paga un recorrido secuencial.
--
--   2. **Borrar al padre recorre al hijo entero.** Postgres tiene que
--      comprobar que nadie referencia la fila que se va. `turno_eliminar_cuenta`
--      y `turno_desvincular_barbero` borran, y lo hacen con el usuario
--      esperando delante de la pantalla.
--
--   3. Y la fila digital se lee **cada pocos segundos** en cada teléfono
--      abierto, que es el patrón de carga real de este producto.
--
-- Con el piloto vacío nada de esto se nota. Ése es justo el problema: se nota
-- el día que hay datos, que es el día en que menos ganas hay de tocar la base.
--
-- ── UN AVISO DEL LINTER QUE NO HAY QUE OBEDECER ─────────────────────────────
-- El mismo informe marca tres índices `turno_` como «sin usar»:
-- `turno_bloqueos_fecha_idx`, `turno_jornadas_fecha_idx` y
-- `turno_suscripciones_silla_pagada_idx`. **No se borran.** «Sin usar» ahí
-- quiere decir «esta base todavía no tiene tráfico»: `turno_jornadas_fecha_idx`
-- lo lee el cron todas las noches en `turno_cerrar_olvidados`. Borrarlos sería
-- optimizar contra un piloto vacío, que es peor que no optimizar.
--
-- Todos son de una sola columna y van con `if not exists`: esta migración se
-- puede volver a correr sin miedo.

create index if not exists turno_bloqueos_perfil_id_idx                    on turno_bloqueos (perfil_id);

create index if not exists turno_canjes_negocio_id_idx                     on turno_canjes (negocio_id);
create index if not exists turno_canjes_perfil_id_idx                      on turno_canjes (perfil_id);
create index if not exists turno_canjes_usuario_id_idx                     on turno_canjes (usuario_id);

create index if not exists turno_citas_cliente_id_idx                      on turno_citas (cliente_id);
create index if not exists turno_citas_grupo_id_idx                        on turno_citas (grupo_id);
create index if not exists turno_citas_negocio_id_idx                      on turno_citas (negocio_id);
create index if not exists turno_citas_perfil_2_id_idx                     on turno_citas (perfil_2_id);
create index if not exists turno_citas_perfil_id_idx                       on turno_citas (perfil_id);
create index if not exists turno_citas_servicio_2_id_idx                   on turno_citas (servicio_2_id);
create index if not exists turno_citas_servicio_id_idx                     on turno_citas (servicio_id);

create index if not exists turno_cola_cita_origen_id_idx                   on turno_cola (cita_origen_id);
create index if not exists turno_cola_grupo_id_idx                         on turno_cola (grupo_id);
create index if not exists turno_cola_negocio_id_idx                       on turno_cola (negocio_id);
create index if not exists turno_cola_perfil_id_idx                        on turno_cola (perfil_id);
create index if not exists turno_cola_servicio_id_idx                      on turno_cola (servicio_id);

create index if not exists turno_eventos_log_negocio_id_idx                on turno_eventos_log (negocio_id);
create index if not exists turno_eventos_log_perfil_id_idx                 on turno_eventos_log (perfil_id);
create index if not exists turno_eventos_log_usuario_id_idx                on turno_eventos_log (usuario_id);

create index if not exists turno_grupos_lider_id_idx                       on turno_grupos (lider_id);
create index if not exists turno_grupos_negocio_id_idx                     on turno_grupos (negocio_id);
create index if not exists turno_grupos_perfil_id_idx                      on turno_grupos (perfil_id);

create index if not exists turno_historial_visitas_cliente_id_idx          on turno_historial_visitas (cliente_id);
create index if not exists turno_historial_visitas_negocio_id_idx          on turno_historial_visitas (negocio_id);
create index if not exists turno_historial_visitas_perfil_id_idx           on turno_historial_visitas (perfil_id);
create index if not exists turno_historial_visitas_servicio_id_idx         on turno_historial_visitas (servicio_id);

create index if not exists turno_membresias_negocio_id_idx                 on turno_membresias (negocio_id);
create index if not exists turno_membresias_perfil_preferido_idx           on turno_membresias (perfil_preferido);
create index if not exists turno_membresias_usuario_id_idx                 on turno_membresias (usuario_id);

create index if not exists turno_notas_barbero_cliente_id_idx              on turno_notas_barbero (cliente_id);

create index if not exists turno_perfiles_negocio_id_idx                   on turno_perfiles (negocio_id);
create index if not exists turno_perfiles_usuario_id_idx                   on turno_perfiles (usuario_id);

create index if not exists turno_preferencias_cliente_negocio_id_idx       on turno_preferencias_cliente (negocio_id);
create index if not exists turno_preferencias_cliente_perfil_pref_id_idx   on turno_preferencias_cliente (perfil_preferido_id);

create index if not exists turno_puntos_negocio_id_idx                     on turno_puntos (negocio_id);
create index if not exists turno_puntos_perfil_id_idx                      on turno_puntos (perfil_id);

create index if not exists turno_resenas_cliente_id_idx                    on turno_resenas (cliente_id);
create index if not exists turno_resenas_perfil_id_idx                     on turno_resenas (perfil_id);

create index if not exists turno_servicios_perfil_id_idx                   on turno_servicios (perfil_id);
