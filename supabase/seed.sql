-- =====================================================================
-- TURNO · Datos semilla (DEMO) · idempotente
-- Barbería demo para probar el flujo de cliente. Código de acceso: DEMO01
-- El "dueño" demo no tiene auth_id (es de catálogo). Un cliente real
-- (magic link) puede unirse con el código y reservar.
-- Para borrar: delete ... where negocio_id = '00000000-0000-0000-0000-0000000000d0'
-- =====================================================================

insert into public.turno_negocios (id, nombre, tipo, codigo_acceso, moneda, direccion, telefono, activo)
values ('00000000-0000-0000-0000-0000000000d0','Barbería Demo','empleados','DEMO01','RD$','Calle Principal 1, Santo Domingo','+18090000000', true)
on conflict (id) do nothing;

insert into public.turno_configuracion_negocio (negocio_id, anticipacion_minima_horas, ventana_llegada_min, gracia_cita_min, puntos_activos, asignacion_por_dueno, doble_servicio_activo)
values ('00000000-0000-0000-0000-0000000000d0', 2, 10, 5, true, false, false)
on conflict do nothing;

insert into public.turno_usuarios (id, nombre, telefono, tipo_usuario)
values ('00000000-0000-0000-0000-0000000000b0','Carlos (Demo)','+18091112222','profesional')
on conflict (id) do nothing;

insert into public.turno_membresias (usuario_id, negocio_id, rol, activo)
values ('00000000-0000-0000-0000-0000000000b0','00000000-0000-0000-0000-0000000000d0','dueno', true)
on conflict do nothing;

insert into public.turno_perfiles (id, usuario_id, negocio_id, tipo_servicio, activo, aprobado, estado_actual)
values ('00000000-0000-0000-0000-0000000000a0','00000000-0000-0000-0000-0000000000b0','00000000-0000-0000-0000-0000000000d0','barbero', true, true, 'disponible')
on conflict (id) do nothing;

insert into public.turno_servicios (id, perfil_id, nombre, duracion_min, precio, activo) values
  ('00000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-0000000000a0','Corte', 30, 500, true),
  ('00000000-0000-0000-0000-000000000052','00000000-0000-0000-0000-0000000000a0','Corte + Barba', 45, 750, true)
on conflict (id) do nothing;

-- Horarios lunes(1) a sábado(6), 9:00–18:00
insert into public.turno_horarios (perfil_id, dia_semana, hora_inicio, hora_fin, tiempo_entre_clientes, activo)
select '00000000-0000-0000-0000-0000000000a0', d, '09:00', '18:00', 10, true
from generate_series(1,6) as d
on conflict do nothing;
