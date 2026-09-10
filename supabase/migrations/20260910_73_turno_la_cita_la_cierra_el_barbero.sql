-- LA CITA LA CIERRA EL BARBERO, NO EL CLIENTE
--
-- Encontrado al subir "atendida" y "no llegó" al cuadro principal, mirando quién
-- puede escribir de verdad en turno_citas. La política de UPDATE decía:
--
--   using (cliente_id = turno_uid() OR negocio_id IN (SELECT turno_mis_negocios()))
--
-- y turno_mis_negocios() incluye los locales donde eres SOLO CLIENTE. Así que
-- cualquier cliente del local podía escribir en cualquier cita del local.
-- Ejecutado contra la base antes de arreglarlo:
--
--   1) un cliente marca SU cita como 'atendida'  ->  visitas=1  puntos=1
--   2) un cliente cancela la cita de OTRO        ->  cancelada
--
-- LO PRIMERO ES ROBO, no un descuido de permisos. Hay un trigger que registra la
-- visita al pasar a 'atendida', así que el cliente puede reservar, marcarla
-- atendida sin ir, y repetir hasta llenar la tarjeta de fidelidad y llevarse el
-- corte gratis. De paso le mete al barbero ingresos que nunca cobró en sus
-- estadísticas. LO SEGUNDO es sabotaje: borrarle la hora a otro cliente.
--
-- Nadie lo notó porque la app solo le enseña esos botones al barbero. Es el
-- mismo patrón que viene saliendo todo el PR —una regla que solo vive en la
-- interfaz no es una regla— pero esta vez con dinero encima.
--
-- DOS CAPAS, porque una sola no llega:
--
--   · LA POLÍTICA deja de mirar "¿perteneces al local?" y pasa a mirar "¿es TU
--     cita, o eres quien la atiende?". Eso cierra el sabotaje: sin fila que
--     tocar, no hay nada que cancelarle a otro.
--
--   · EL TRIGGER limita QUÉ puede escribir un cliente en su propia cita. RLS
--     razona por filas, no por valores, y aquí el problema es un valor concreto:
--     'atendida' significa "esto ya se cobró" y solo puede decirlo quien cobra.
--     Al cliente le quedan las transiciones que son suyas de verdad: confirmar
--     que irá, decir que va en camino, y cancelar.

drop policy if exists turno_citas_update on turno_citas;

create policy turno_citas_update on turno_citas
  for update
  using (
    cliente_id = public.turno_uid()
    or public.turno_es_mi_perfil(perfil_id)
    or negocio_id in (select public.turno_negocios_admin())
  )
  with check (
    cliente_id = public.turno_uid()
    or public.turno_es_mi_perfil(perfil_id)
    or negocio_id in (select public.turno_negocios_admin())
  );

create or replace function turno_cita_escritura_del_cliente()
returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_staff boolean;
begin
  -- Quien atiende la cita, o el dueño del local. Los dos pueden cerrarla.
  v_staff := public.turno_es_mi_perfil(new.perfil_id)
          or (new.negocio_id in (select public.turno_negocios_admin()));
  if v_staff then return new; end if;

  -- A partir de aquí es el cliente escribiendo en su propia cita (la política
  -- ya no deja otra cosa). Solo puede decir tres cosas, y ninguna vale dinero.
  if new.estado is distinct from old.estado
     and new.estado not in ('confirmada', 'en_camino', 'cancelada') then
    raise exception 'esa parte de la cita la cierra el barbero';
  end if;

  -- Y no puede firmar el cobro por su cuenta aunque no cambie el estado.
  if new.atendida_at is distinct from old.atendida_at then
    raise exception 'esa parte de la cita la cierra el barbero';
  end if;

  return new;
end $$;

drop trigger if exists trg_turno_cita_escritura on turno_citas;
create trigger trg_turno_cita_escritura
  before update on turno_citas
  for each row execute function turno_cita_escritura_del_cliente();

comment on function turno_cita_escritura_del_cliente is
  'Un cliente solo puede confirmar, decir que va en camino o cancelar SU cita. '
  'Marcarla atendida crea una visita y suma punto de fidelidad (trigger '
  'turno_registrar_visita_cita), así que es una firma de cobro: solo la da '
  'quien cobra. RLS no puede expresar esto porque razona por filas, no por '
  'valores.';
