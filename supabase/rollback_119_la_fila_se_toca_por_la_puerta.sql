-- VUELTA ATRÁS DE LA MIGRACIÓN 119 (no es una migración: no se aplica sola).
--
-- Deja la fila y los perfiles como estaban antes de la 119 (definiciones
-- copiadas de la base viva el 23 sep). OJO: esto vuelve a abrir el hueco que
-- la 119 cerró —un cliente puede colarse en la fila o apuntarse visitas
-- escribiendo directo en la tabla—. Solo para salir de un apuro.

drop trigger if exists trg_turno_cola_a_mano on public.turno_cola;
drop function if exists public.turno_cola_a_mano();

drop policy if exists turno_cola_update on public.turno_cola;
create policy turno_cola_update on public.turno_cola
  for update to authenticated
  using      ((cliente_id = turno_uid()) or (negocio_id in (select turno_mis_negocios())))
  with check ((cliente_id = turno_uid()) or (negocio_id in (select turno_mis_negocios())));

drop policy if exists turno_cola_insert on public.turno_cola;
create policy turno_cola_insert on public.turno_cola
  for insert to authenticated
  with check ((cliente_id = turno_uid()) or (negocio_id in (select turno_mis_negocios())));

create or replace function public.turno_perfil_solo_lo_suyo()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if (new.aprobado             is distinct from old.aprobado
   or new.suspendido           is distinct from old.suspendido
   or new.suspendido_motivo    is distinct from old.suspendido_motivo
   or new.pendiente_de         is distinct from old.pendiente_de
   or new.acepta_por_su_cuenta is distinct from old.acepta_por_su_cuenta)
     and not public.turno_perfil_admin(new.id) then
    raise exception 'eso lo decide la barbería, no la silla';
  end if;

  if (new.limite_cola               is distinct from old.limite_cola
   or new.modo_atencion             is distinct from old.modo_atencion
   or new.anticipacion_minima_horas is distinct from old.anticipacion_minima_horas
   or new.ventana_llegada_min       is distinct from old.ventana_llegada_min
   or new.gracia_cita_min           is distinct from old.gracia_cita_min
   or new.umbral_confirmacion       is distinct from old.umbral_confirmacion)
     and not public.turno_manda_en_el_horario(new.id) then
    raise exception 'las reglas de esa silla las pone la barbería';
  end if;

  return new;
end $function$;
