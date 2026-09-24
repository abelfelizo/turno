-- ═══════════════════════════════════════════════════════════════════════════
-- 119 · LA FILA SE TOCA POR LA PUERTA, NO POR LA VENTANA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- APLICADA el 23 sep con visto bueno. Antes, probada en seco (14/14) dentro
-- de una transacción revertida; después, contra la base: fila_a_mano 14/14,
-- sin_cita 27/27, motor_cola 34/34. Vuelta atrás: supabase/rollback_119_…sql.
--
-- LO QUE SE ENCONTRÓ (23 sep, revisando empleado frente a independiente):
--
-- Todo lo que mueve la fila vive en funciones SECURITY DEFINER con su
-- portero —entrar, llamar, sentar, sacar, sustituir— y esas funciones están
-- bien. Pero la TABLA seguía abierta por detrás con dos políticas viejas:
--
--   turno_cola_insert  cliente_id = yo  OR  el local es uno de los míos
--   turno_cola_update  cliente_id = yo  OR  el local es uno de los míos
--
-- «Uno de los míos» incluye ser CLIENTE del local. Con su sesión normal y
-- sin pasar por la app, cualquier cliente podía (probado contra la base):
--
--   · meterse en la fila con prioridad 1 y puesto 0, saltándose fila
--     abierta, un turno por persona, el límite y el orden;
--   · marcar su propio turno como 'atendido' — y el trigger de visitas le
--     apunta una visita con su precio: dinero que el barbero no cobró en sus
--     estadísticas, y puntos de fidelidad regalados.
--
-- Tocar el turno de OTRO cliente no se podía (la política de lectura lo
-- esconde). Lo que faltaba era cerrar lo propio.
--
-- LO QUE HACE:
--
--   1. INSERT directo: se cierra. Ningún turno nace escribiendo en la tabla;
--      todos entran por turno_entrar_a_cola, turno_registrar_fisico,
--      turno_atender_sin_cita o el trigger de citas, que son SECURITY
--      DEFINER y no pasan por RLS. (Revisado: la app no inserta en ningún
--      sitio, ni la de ahora ni la de 224acb9.)
--
--   2. UPDATE directo: solo quien opera esa silla (turno_manda_en_la_silla)
--      o el propio cliente, y SOLO para dos cosas, que son las únicas que la
--      app hace a mano:
--        · el cliente sale de la fila:   en_fila/llamado/en_camino → abandonado
--          (lib/db.ts · salirDeCola, «Salir de la fila» en Mi turno)
--        · el barbero cobra:             llamado/en_camino/atendiendo → atendido
--          (lib/db.ts · actualizarEstadoCola, «Cobrar» en Mi silla)
--      En los dos casos solo pueden cambiar `estado` y `atendido_at`. Todo lo
--      demás —prioridad, puesto, barbero, servicio, relojes— es de las RPC.
--      Lo vigila un trigger, como turno_perfil_solo_lo_suyo en perfiles: la
--      política dice QUIÉN, el trigger dice QUÉ.
--
--   3. Los puntos de una silla que no es autónoma: el empleado podía
--      encender sus propios puntos (no tenía efecto —turno_fidelidad lee los
--      del local para él—, pero dejaba un dato que miente). Ahora los puntos
--      de un perfil los cambia la silla autónoma o su administrador.
--
-- LO QUE NO CAMBIA: las RPC corren como su dueño (current_user no es
-- 'authenticated'), así que el trigger las deja pasar y las políticas no las
-- ven. La lectura de la fila tampoco se toca.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · nadie inserta en la fila a mano ────────────────────────────────────
drop policy if exists turno_cola_insert on public.turno_cola;
-- Sin política de INSERT, con RLS activa, `authenticated` no puede insertar.

-- ── 2 · quién puede tocar un turno a mano ──────────────────────────────────
drop policy if exists turno_cola_update on public.turno_cola;
create policy turno_cola_update on public.turno_cola
  for update to authenticated
  using      (cliente_id = public.turno_uid() or public.turno_manda_en_la_silla(perfil_id))
  with check (cliente_id = public.turno_uid() or public.turno_manda_en_la_silla(perfil_id));

-- ── … y qué puede tocar ────────────────────────────────────────────────────
create or replace function public.turno_cola_a_mano()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  -- Las RPC corren como su dueño: esto solo mira a quien escribe directo.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if (to_jsonb(new) - array['estado', 'atendido_at'])
       is distinct from (to_jsonb(old) - array['estado', 'atendido_at']) then
    raise exception 'eso se cambia desde la app, no a mano';
  end if;

  -- El cliente puede irse de la fila.
  if old.cliente_id = public.turno_uid()
     and old.estado in ('en_fila', 'llamado', 'en_camino')
     and new.estado = 'abandonado' then
    return new;
  end if;

  -- Quien opera la silla puede cerrar el turno que tiene delante.
  if public.turno_manda_en_la_silla(old.perfil_id)
     and old.estado in ('llamado', 'en_camino', 'atendiendo')
     and new.estado = 'atendido' then
    return new;
  end if;

  raise exception 'ese cambio en la fila no se puede hacer así';
end $function$;

drop trigger if exists trg_turno_cola_a_mano on public.turno_cola;
create trigger trg_turno_cola_a_mano
  before update on public.turno_cola
  for each row execute function public.turno_cola_a_mano();

-- ── 3 · los puntos de la silla son de quien lleva su tarjeta ────────────────
-- Copia de la definición viva de turno_perfil_solo_lo_suyo, con UN bloque
-- nuevo al final.
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

  -- NUEVO (119). La tarjeta propia es de la silla autónoma; la del empleado
  -- es la del local (turno_fidelidad). Encenderla en su perfil no hacía nada
  -- y dejaba un dato que miente. El administrador sí puede, para apagar una
  -- que quedó encendida.
  if (new.puntos_activos    is distinct from old.puntos_activos
   or new.puntos_por_visita is distinct from old.puntos_por_visita
   or new.puntos_meta       is distinct from old.puntos_meta
   or new.premio            is distinct from old.premio)
     and not public.turno_perfil_autonomo(new.id)
     and not public.turno_perfil_admin(new.id) then
    raise exception 'los puntos de esa silla los lleva el local';
  end if;

  return new;
end $function$;
