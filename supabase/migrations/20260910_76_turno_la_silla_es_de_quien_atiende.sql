-- LA SILLA ES DE QUIEN ATIENDE, Y LA FILA NO ES DE LOS CLIENTES
--
-- Reportado desde el teléfono, mirando el panel del dueño: "existen unos
-- controles que no debería tener el dueño sobre los clientes que está
-- atendiendo un barbero, veo que puede sacarlo de la fila a alguien que está
-- sentado". Es verdad, y ejecutado contra la base:
--
--   el cliente estaba: atendiendo
--   el dueño sacándolo de la silla: (ningún error)
--   y quedó en: abandonado
--
-- No es solo una descortesía: 'abandonado' no registra visita, así que el corte
-- que el barbero está dando en ese momento desaparece de sus cuentas.
--
-- Y buscando por dónde entraba salió algo peor, del mismo hueco. El portero de
-- todas las operaciones sobre un turno es turno_cola_operable, y decía:
--
--   if v.perfil_id is not null and not turno_perfil_operable(v.perfil_id) ...
--
-- O sea: si el turno NO tiene barbero asignado —el "cualquiera disponible", que
-- es la opción normal del cliente— no comprobaba nada más que pertenecer al
-- local. Y al local pertenecen los clientes. Ejecutado contra la base, con un
-- cliente cualquiera y el turno de OTRO cliente:
--
--   turno_sacar_de_cola(turno ajeno) -> sin error, y el turno quedó 'abandonado'
--
-- Cualquiera que se una con el código podía ir echando de la fila a los demás.
-- Es el mismo patrón que la migración 73 —sabotaje entre clientes del mismo
-- local— y se le escapó a la suite de puertas por la misma razón: su intruso es
-- de OTRO local, y rebota antes, en "sin acceso al negocio". El intruso que hay
-- que temer es el de dentro.
--
-- DOS REGLAS, las dos en el portero, que es por donde pasan las nueve
-- operaciones de fila (sacar, mover, llamar, iniciar, devolver, no_esta,
-- sustituir, cambiar servicio, dar más tiempo):
--
--   · SIN BARBERO ASIGNADO manda el local, y "el local" son sus profesionales y
--     su dueño. Ser cliente no basta.
--   · EN LA SILLA manda quien atiende. Ni el dueño le saca un cliente de las
--     manos a un barbero a mitad de corte. Si el barbero se queda sin batería,
--     el turno lo cierra solo el mantenimiento a las ocho horas; eso es un
--     problema pequeño y raro, y el otro es que te levanten al cliente.

create or replace function turno_cola_operable(p_cola uuid)
returns turno_cola
language plpgsql security definer set search_path to 'public' as $$
declare v public.turno_cola;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  select * into v from turno_cola where id = p_cola;
  if v.id is null then raise exception 'turno inexistente'; end if;
  if not (v.negocio_id in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;

  if v.perfil_id is not null then
    if not public.turno_perfil_operable(v.perfil_id) then
      raise exception 'no puedes operar este turno';
    end if;
  else
    -- Turno sin barbero: hace falta ser del oficio en ESTE local, o su dueño.
    if not exists (
          select 1 from turno_perfiles p
           where p.negocio_id = v.negocio_id
             and p.usuario_id = public.turno_uid()
             and p.activo and p.aprobado)
       and not (v.negocio_id in (select public.turno_negocios_admin()))
    then
      raise exception 'la fila del local la maneja el equipo, no los clientes';
    end if;
  end if;

  -- Y lo que ya está en una silla solo lo toca quien lo está atendiendo.
  if v.estado = 'atendiendo' and v.perfil_id is not null
     and not public.turno_es_mi_perfil(v.perfil_id) then
    raise exception 'ese cliente está en la silla de otro barbero';
  end if;

  return v;
end $$;

comment on function turno_cola_operable is
  'Portero de las nueve operaciones de fila. Un turno sin barbero asignado lo '
  'maneja el equipo del local (profesional aprobado o dueño), nunca un cliente; '
  'y un turno en la silla solo lo toca quien atiende, ni siquiera el dueño.';
