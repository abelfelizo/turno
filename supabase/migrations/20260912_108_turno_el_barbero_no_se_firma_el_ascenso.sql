-- EL BARBERO NO SE FIRMA EL ASCENSO
--
-- El fallo número uno de este repo, otra vez, y esta vez **lo introduje yo en la
-- migración de al lado**. La 107 añadió `acepta_por_su_cuenta` y puso porteros en
-- las tres funciones que dependen de él. Lo que no hizo fue la pregunta que la
-- 101 dejó escrita con todas las letras: **¿y por la tabla?**
--
-- Comprobado contra la base, con `set local role authenticated` y la sesión de un
-- empleado corriente:
--
--   update turno_perfiles set acepta_por_su_cuenta = true where id = <el suyo>
--     → 1 fila. Y acto seguido sentó un walk-in.
--
-- O sea: la 107 no valía nada. Pero al mirar el resto de la fila salió que el
-- agujero era mucho más viejo y mucho más grande:
--
--   aprobado            → SE APRUEBA SOLO
--   suspendido          → SE LEVANTA LA SUSPENSIÓN SOLO
--   acepta_por_su_cuenta→ SE DA EL PERMISO SOLO
--   anticipacion, ventana, gracia, umbral → SE LAS PONE SOLO
--   limite_cola, modo_atencion            → se los cambia solo
--
-- Lo primero es lo peor. **`aprobado` es la puerta entera de la migración 94**:
-- en un local de empleados entras PENDIENTE y solo el dueño te mete. Cualquiera
-- con el código del local —que se comparte por WhatsApp— se unía, se aprobaba de
-- un `update`, y aparecía en el escaparate como barbero del local, tomando
-- clientes de verdad. Y `suspendido` deshace de un `update` lo que la 92
-- construyó con cuidado.
--
-- Las reglas de tiempo son el caso más didáctico, porque la función ya lo decía
-- bien y con su frase propia: `turno_guardar_reglas_barbero` rebota al empleado
-- con «las pone la barbería». La tabla se lo daba igual. **Una regla que solo
-- vive en la función no es una regla** — escrito en la cabecera de la 101 para el
-- lado de LEER, y nunca aplicado al lado de ESCRIBIR.
--
-- ── POR QUÉ LA RLS NO BASTA AQUÍ ────────────────────────────────────────────
-- La política dice `usuario_id = turno_uid() OR negocio_id in (admin)`, y está
-- BIEN: el barbero tiene que poder tocar su propia fila —su foto, su bio, su
-- estado (irse a descanso), su Instagram—. Lo que RLS no sabe hacer es «esta
-- fila sí, pero estas seis columnas no». Eso es un trigger.
--
-- ── QUÉ SE VIGILA Y QUÉ NO ──────────────────────────────────────────────────
-- Solo se mira lo que se ha demostrado que estaba abierto, y se agrupa por quién
-- manda de verdad, reutilizando las reglas que ya existen:
--
--   · `aprobado`, `suspendido`, `suspendido_motivo`, `acepta_por_su_cuenta`
--     → son del LOCAL. `turno_perfil_admin`.
--   · `limite_cola`, `modo_atencion` y los cuatro tiempos
--     → son de quien manda en esa silla. `turno_manda_en_el_horario` (R11), que
--       es exactamente lo que ya contesta `turno_guardar_reglas_barbero`.
--
-- Y NO se toca nada de lo que es suyo de verdad: foto, bio, especialidad,
-- mensaje, instagram, whatsapp, `estado_actual` (irse a descanso es cosa suya) y
-- `activo`. Cerrar de más aquí le quitaría al barbero su propio perfil.
--
-- ── LA TRAMPA DE HACER ESTO CON UN TRIGGER ──────────────────────────────────
-- Un `before update` se dispara TAMBIÉN cuando quien escribe es una función
-- `SECURITY DEFINER` legítima — `turno_unirse_profesional` pone `aprobado`,
-- `turno_suspender_barbero` pone `suspendido`, `turno_guardar_reglas_barbero`
-- pone los tiempos—. Si el trigger no las distingue, esta migración rompe media
-- app.
--
-- El discriminador, comprobado contra la base y no supuesto:
--
--   llamada directa desde el API        → current_user = 'authenticated'
--   dentro de una SECURITY DEFINER      → current_user = 'postgres'
--
-- Así que el portero solo se planta en la puerta que de verdad existe: la
-- llamada directa. Las funciones, que ya tienen su propio portero cada una,
-- pasan. Es la misma lección de la 89 —«un portero se prueba con la puerta que
-- de verdad existe»— aplicada al revés: también hay que saber cuál NO es puerta.
--
-- ── Y EL TRIGGER NO PUEDE SER `SECURITY DEFINER` ────────────────────────────
-- La primera versión de este trigger lo era, por costumbre: en este repo casi
-- todo lo es. No cerró NADA, y las pruebas lo cantaron: 8 de 15.
--
-- El motivo es exactamente lo de arriba dado la vuelta. `SECURITY DEFINER` hace
-- que `current_user` dentro de la función sea su DUEÑO — o sea `postgres`—
-- **siempre**, también cuando la llamada viene del API. El portero preguntaba
-- «¿quién eres?» con la única herramienta que él mismo acababa de romper, se
-- contestaba 'postgres', y se apartaba.
--
-- Va sin `security definer` a propósito, y eso no le quita nada: las tres
-- funciones que consulta —`turno_perfil_admin`, `turno_manda_en_el_horario` y
-- el `turno_uid()` de dentro— sí son DEFINER y tienen su grant.
--
-- **Un portero que se disfraza no puede reconocer a nadie.**

-- SECURITY INVOKER a propósito (ver la cabecera): es lo único que deja ver
-- quién llama de verdad.
create or replace function public.turno_perfil_solo_lo_suyo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Solo se vigila la llamada directa al API. Las funciones SECURITY DEFINER
  -- corren como 'postgres' y llevan su propio portero.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if (new.aprobado             is distinct from old.aprobado
   or new.suspendido           is distinct from old.suspendido
   or new.suspendido_motivo    is distinct from old.suspendido_motivo
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
end $$;

drop trigger if exists trg_turno_perfil_solo_lo_suyo on turno_perfiles;

create trigger trg_turno_perfil_solo_lo_suyo
  before update on turno_perfiles
  for each row
  execute function public.turno_perfil_solo_lo_suyo();
