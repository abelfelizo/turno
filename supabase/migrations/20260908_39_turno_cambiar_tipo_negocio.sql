-- CAMBIAR LA MODALIDAD DEL LOCAL
--
-- La modalidad se elegía UNA VEZ en el onboarding, en cinco segundos, y no se
-- podía cambiar nunca más. Como de ella cuelga quién decide precios y horarios
-- de todo el equipo (R11), equivocarse ahí dejaba el local atrapado: la única
-- salida era cerrarlo y volver a empezar.
--
-- Además, un local cambia de verdad: una barbería de empleados que se cansa de
-- la nómina y pasa a alquilar asientos es una historia normal, no un caso raro.
--
-- Cambiar el tipo REALINEA a todo el equipo, porque dejar membresías con la
-- modalidad vieja es peor que no cambiar nada: la mitad del local seguiría con
-- reglas que ya no existen y nadie sabría por qué.

create or replace function turno_cambiar_tipo_negocio(p_negocio uuid, p_tipo text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_rol text;
begin
  if p_tipo not in ('empleados', 'espacios_rentados') then raise exception 'tipo invalido'; end if;
  if not (p_negocio in (select public.turno_negocios_admin())) then raise exception 'no autorizado'; end if;

  update turno_negocios set tipo = p_tipo where id = p_negocio;

  v_rol := case when p_tipo = 'espacios_rentados' then 'barbero_renta' else 'empleado' end;
  update turno_membresias set rol = v_rol
   where negocio_id = p_negocio and rol in ('empleado', 'barbero_renta');
end $$;

grant execute on function turno_cambiar_tipo_negocio(uuid, text) to authenticated;
