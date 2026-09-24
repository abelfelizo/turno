-- EL DUEÑO PODÍA EDITAR LOS SERVICIOS Y HORARIOS DE QUIEN LE RENTA
--
-- Reportado en el piloto: "si el dueño alquila asientos no debe poner horarios
-- de barberos, solo manda sobre él; tenerlo ahí genera confusión".
--
-- Tiene razón, y no era solo confusión de pantalla. Las políticas decían:
--
--   (turno_es_mi_perfil(p) AND turno_perfil_autonomo(p)) OR turno_perfil_admin(p)
--
-- Ese OR final es incondicional: el dueño del local podía escribir los
-- servicios, los precios y la jornada de CUALQUIER perfil del local, también de
-- los que le alquilan el asiento. Justo lo que R11 dice que no.
--
-- Un barbero que paga por su silla es un negocio independiente. Que su casero
-- pueda cambiarle el precio del corte no es una molestia de interfaz: es que la
-- modalidad "alquilo asientos" no significaba nada del lado del servidor.
--
-- La pantalla del dueño ya lo intentaba —deshabilita los editores cuando la
-- persona es autónoma— pero se apoyaba en un rol que le llegaba por parámetro
-- de navegación. Si ese parámetro venía vacío, la pantalla asumía "empleado" y
-- habilitaba todo. Otra vez la regla viviendo solo en la interfaz.
--
-- Ahora el dueño manda sobre los EMPLEADOS y sobre su propia silla, y sobre
-- nadie más. Quien renta se administra solo.
--
-- Lo que el dueño SIGUE pudiendo hacer con un rentado, y debe:
--   · aprobarlo o rechazarlo al entrar          (turno_perfiles)
--   · desvincularlo del local                    (turno_desvincular_barbero)
--   · cambiarle la modalidad                     (turno_cambiar_modalidad)
--   · verlo en la fila y en el estado del local
-- O sea: decidir si trabaja aquí, no cómo trabaja.

drop policy if exists turno_servicios_write on turno_servicios;
create policy turno_servicios_write on turno_servicios
  for all
  using (
    (public.turno_es_mi_perfil(perfil_id) and public.turno_perfil_autonomo(perfil_id))
    or (public.turno_perfil_admin(perfil_id) and not public.turno_perfil_autonomo(perfil_id))
  )
  with check (
    (public.turno_es_mi_perfil(perfil_id) and public.turno_perfil_autonomo(perfil_id))
    or (public.turno_perfil_admin(perfil_id) and not public.turno_perfil_autonomo(perfil_id))
  );

drop policy if exists turno_horarios_write on turno_horarios;
create policy turno_horarios_write on turno_horarios
  for all
  using (
    (public.turno_es_mi_perfil(perfil_id) and public.turno_perfil_autonomo(perfil_id))
    or (public.turno_perfil_admin(perfil_id) and not public.turno_perfil_autonomo(perfil_id))
  )
  with check (
    (public.turno_es_mi_perfil(perfil_id) and public.turno_perfil_autonomo(perfil_id))
    or (public.turno_perfil_admin(perfil_id) and not public.turno_perfil_autonomo(perfil_id))
  );

-- Los BLOQUEOS se quedan como estaban, a propósito: el dueño necesita poder
-- cerrar el local un día festivo aunque dentro haya gente que le renta. Bloquear
-- una hora no es fijarle las reglas a nadie, es decir que el local está cerrado.
