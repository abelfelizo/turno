-- ENTRAR A UN LOCAL LO FIRMAN LOS DOS
--
-- Regla del dueño del producto, corrigiendo la migración 94:
--
--   «Puede agregar y puede ser agregado por barberos con aprobación mutua.»
--
-- Lo que había, y en qué falla cada mitad:
--
--   · EN UN LOCAL DE EMPLEADOS el barbero entra PENDIENTE y el dueño lo mete.
--     Media puerta bien puesta, pero solo media: el local no puede llamar a
--     nadie, solo esperar a que aparezca con el código.
--
--   · EN ASIENTOS ALQUILADOS entraba ACTIVO, se agregaba él solo. O sea que el
--     código del local —que se comparte por WhatsApp, y esto ya nos costó la
--     migración 108— metía a cualquiera en el escaparate del local sin que el
--     casero dijera nada. Un local de asientos alquilados no dirige a su
--     inquilino, cierto (migración 92), pero **decidir quién entra en tu casa no
--     es dirigir a nadie**: es tu casa.
--
-- Ahora las dos direcciones existen y las dos piden el sí del otro:
--
--   barbero → local   con el código del local   → falta el sí del LOCAL
--   local → barbero   con el código del barbero → falta el sí del BARBERO
--
-- ── POR QUÉ NO HAY UNA SEGUNDA COLUMNA DE APROBACIÓN ────────────────────────
-- La tentación es añadir `aceptado_por_barbero` junto a `aprobado`. Sería un
-- error caro: **veintitrés funciones y una política leen `aprobado`** —se
-- cuentan desde `pg_proc`, no de memoria— y todas tendrían que aprender la
-- segunda columna. Olvidar una sola es exactamente la familia de fallos de la
-- 101 y la 102: la misma regla leída por dos puertas distintas.
--
-- Así que `aprobado` NO cambia de significado: sigue queriendo decir «esta
-- silla está viva en este local». Lo único que se añade es **de quién falta el
-- sí** mientras todavía no lo está. Las veintitrés funciones siguen valiendo
-- tal cual, sin tocar ni una.
--
-- El CHECK deja la contradicción fuera del alcance: si está aprobado, no puede
-- quedar nadie por firmar.

alter table turno_perfiles
  add column if not exists pendiente_de text;

alter table turno_perfiles drop constraint if exists turno_perfiles_pendiente_de_check;
alter table turno_perfiles add constraint turno_perfiles_pendiente_de_check
  check (pendiente_de is null
         or (pendiente_de in ('local','barbero') and not aprobado));

comment on column turno_perfiles.pendiente_de is
  'De quién falta el sí: local (el barbero pidió entrar) o barbero (el local le invitó). NULL cuando ya está resuelto.';

-- Los que ya estaban esperando llevan meses esperando al LOCAL: esa era la
-- única dirección que existía.
update turno_perfiles
   set pendiente_de = 'local'
 where aprobado = false and activo and pendiente_de is null;

-- ── EL BARBERO PIDE ENTRAR ──────────────────────────────────────────────────
-- Cuerpo real de la base con un solo cambio de fondo: `v_entra_aprobado` era
-- `(v_tipo = 'espacios_rentados')` y ahora nadie entra aprobado. El rol lo
-- sigue poniendo el local (migración 38); lo que ya no pone es el sí.
create or replace function public.turno_unirse_profesional(
  p_codigo text, p_tipo_servicio text, p_rol text, p_nombre text, p_telefono text)
returns turno_perfiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid; v_neg uuid; v_tipo text; v_rol text;
  v_perfil public.turno_perfiles;
begin
  if auth.uid() is null then raise exception 'no autenticado'; end if;
  select id, tipo into v_neg, v_tipo from turno_negocios where codigo_acceso = upper(p_codigo) and activo;
  if v_neg is null then raise exception 'codigo invalido'; end if;

  v_rol := case when v_tipo = 'espacios_rentados' then 'barbero_renta' else 'empleado' end;

  insert into turno_usuarios(auth_id,nombre,telefono,tipo_usuario,email)
  values(auth.uid(),p_nombre,p_telefono,'profesional',auth.jwt()->>'email')
  on conflict(auth_id) do update
    set nombre=excluded.nombre, telefono=excluded.telefono,
        tipo_usuario='profesional', updated_at=now()
  returning id into v_uid;

  update turno_membresias set rol = v_rol, activo = true
   where usuario_id = v_uid and negocio_id = v_neg and rol in ('empleado','barbero_renta');
  if not found then
    insert into turno_membresias(usuario_id,negocio_id,rol,activo) values(v_uid,v_neg,v_rol,true);
  end if;

  select * into v_perfil from turno_perfiles where usuario_id=v_uid and negocio_id=v_neg;
  if v_perfil.id is null then
    insert into turno_perfiles(usuario_id,negocio_id,tipo_servicio,activo,aprobado,pendiente_de,estado_actual)
    values(v_uid,v_neg,coalesce(p_tipo_servicio,'barbero'),true,false,'local','disponible')
    returning * into v_perfil;

  -- Si el LOCAL ya le había invitado y él entra por el código, eso son los dos
  -- síes: no tiene sentido dejarle esperando por una firma que acaba de dar.
  elsif v_perfil.pendiente_de = 'barbero' then
    update turno_perfiles set aprobado = true, pendiente_de = null
     where id = v_perfil.id returning * into v_perfil;
  end if;

  return v_perfil;
end $$;

-- ── EL LOCAL INVITA ─────────────────────────────────────────────────────────
-- La dirección que no existía. Se identifica al barbero por su `codigo_barbero`,
-- que es ÚNICO, se genera solo al hacerse profesional y ya se enseña en su
-- pantalla: no hace falta inventar un buscador ni pedir teléfonos.
--
-- Deliberadamente NO se puede invitar por teléfono ni por correo: eso permitiría
-- barrer la tabla de usuarios probando números. El código lo da su dueño.
create or replace function public.turno_invitar_barbero(p_negocio uuid, p_codigo text)
returns turno_perfiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid; v_tipo text; v_rol text; v_barbero uuid; v_perfil public.turno_perfiles;
begin
  v_uid := public.turno_uid();
  if v_uid is null then raise exception 'no autenticado'; end if;
  if not (p_negocio in (select public.turno_negocios_admin())) then
    raise exception 'solo el dueño del local invita a trabajar en él';
  end if;

  select tipo into v_tipo from turno_negocios where id = p_negocio and activo;
  if v_tipo is null then raise exception 'ese local no existe'; end if;

  select id into v_barbero from turno_usuarios
   where codigo_barbero = upper(trim(p_codigo)) and tipo_usuario = 'profesional';
  if v_barbero is null then raise exception 'no hay ningún profesional con ese código'; end if;
  if v_barbero = v_uid then raise exception 'ese eres tú'; end if;

  select * into v_perfil from turno_perfiles where usuario_id = v_barbero and negocio_id = p_negocio;
  if v_perfil.id is not null then
    if v_perfil.aprobado and v_perfil.activo then
      raise exception 'ya trabaja en tu local';
    elsif v_perfil.pendiente_de = 'barbero' then
      raise exception 'ya le invitaste: falta que él acepte';
    elsif v_perfil.pendiente_de = 'local' then
      -- Él pidió entrar y tú le invitas: eso son los dos síes.
      update turno_perfiles set aprobado = true, pendiente_de = null
       where id = v_perfil.id returning * into v_perfil;
      return v_perfil;
    end if;
  end if;

  v_rol := case when v_tipo = 'espacios_rentados' then 'barbero_renta' else 'empleado' end;

  update turno_membresias set rol = v_rol, activo = true
   where usuario_id = v_barbero and negocio_id = p_negocio and rol in ('empleado','barbero_renta');
  if not found then
    insert into turno_membresias(usuario_id,negocio_id,rol,activo)
    values(v_barbero,p_negocio,v_rol,true);
  end if;

  if v_perfil.id is null then
    insert into turno_perfiles(usuario_id,negocio_id,tipo_servicio,activo,aprobado,pendiente_de,estado_actual)
    values(v_barbero,p_negocio,'barbero',true,false,'barbero','disponible')
    returning * into v_perfil;
  else
    -- Existía desactivado (se fue, o rechazó antes). Volver a invitar es válido.
    update turno_perfiles set activo = true, aprobado = false, pendiente_de = 'barbero'
     where id = v_perfil.id returning * into v_perfil;
  end if;

  return v_perfil;
end $$;

-- ── LOS DOS SÍES, CADA UNO EN SU PUERTA ─────────────────────────────────────
-- Dos funciones y no una, porque no son el mismo permiso: una la contesta el
-- local sobre una silla suya, la otra la contesta el barbero sobre sí mismo.
-- Las dos son SECURITY DEFINER a propósito: el trigger de la 108 prohíbe tocar
-- `aprobado` desde el API, y esa prohibición tiene que seguir en pie — la única
-- forma legítima de moverlo es pasando por una de estas dos.

create or replace function public.turno_responder_invitacion(p_perfil uuid, p_acepta boolean)
returns turno_perfiles
language plpgsql
security definer
set search_path = public
as $$
declare v_perfil public.turno_perfiles;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  select * into v_perfil from turno_perfiles where id = p_perfil;
  if v_perfil.id is null then raise exception 'esa invitación no existe'; end if;
  if not public.turno_es_mi_perfil(p_perfil) then
    raise exception 'esa invitación no es tuya';
  end if;
  if v_perfil.pendiente_de is distinct from 'barbero' then
    raise exception 'ahí no falta tu firma';
  end if;

  if p_acepta then
    update turno_perfiles set aprobado = true, pendiente_de = null
     where id = p_perfil returning * into v_perfil;
  else
    update turno_perfiles set activo = false, aprobado = false, pendiente_de = null
     where id = p_perfil returning * into v_perfil;
  end if;
  return v_perfil;
end $$;

create or replace function public.turno_responder_solicitud(p_perfil uuid, p_acepta boolean)
returns turno_perfiles
language plpgsql
security definer
set search_path = public
as $$
declare v_perfil public.turno_perfiles;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  select * into v_perfil from turno_perfiles where id = p_perfil;
  if v_perfil.id is null then raise exception 'esa solicitud no existe'; end if;
  if not public.turno_perfil_admin(p_perfil) then
    raise exception 'quién entra a este local lo decide su dueño';
  end if;
  if v_perfil.pendiente_de is distinct from 'local' then
    raise exception 'ahí no falta tu firma';
  end if;

  if p_acepta then
    update turno_perfiles set aprobado = true, pendiente_de = null
     where id = p_perfil returning * into v_perfil;
  else
    update turno_perfiles set activo = false, aprobado = false, pendiente_de = null
     where id = p_perfil returning * into v_perfil;
  end if;
  return v_perfil;
end $$;

-- ── LO QUE TIENE QUE VER CADA UNO ───────────────────────────────────────────
-- El barbero no tiene ninguna pantalla donde le quepa una invitación: hasta hoy
-- lo único que podía estar pendiente era una solicitud SUYA. Esto es lo que la
-- app le pregunta al arrancar.
create or replace function public.turno_mis_invitaciones()
returns table(perfil_id uuid, negocio_id uuid, negocio text, tipo_negocio text, rol text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, n.id, n.nombre, n.tipo,
         case when n.tipo = 'espacios_rentados' then 'barbero_renta' else 'empleado' end
    from public.turno_perfiles p
    join public.turno_negocios n on n.id = p.negocio_id
   where p.usuario_id = public.turno_uid()
     and p.activo and p.pendiente_de = 'barbero' and n.activo
   order by n.nombre;
$$;

revoke execute on function public.turno_invitar_barbero(uuid, text)       from public, anon;
revoke execute on function public.turno_responder_invitacion(uuid, boolean) from public, anon;
revoke execute on function public.turno_responder_solicitud(uuid, boolean)  from public, anon;
revoke execute on function public.turno_mis_invitaciones()                from public, anon;
grant  execute on function public.turno_invitar_barbero(uuid, text)       to authenticated;
grant  execute on function public.turno_responder_invitacion(uuid, boolean) to authenticated;
grant  execute on function public.turno_responder_solicitud(uuid, boolean)  to authenticated;
grant  execute on function public.turno_mis_invitaciones()                to authenticated;

-- ── Y LA COLUMNA NUEVA, CERRADA POR LA TABLA ────────────────────────────────
-- La 108 al pie de la letra: cada columna que decide algo que no es tuyo entra
-- en el trigger el mismo día que nace. `pendiente_de` dice de quién falta el sí
-- — si el barbero pudiera escribirla, se pondría 'local' en una invitación que
-- nadie le hizo y se colaría por la puerta del dueño.
--
-- Las cuatro funciones de arriba pasan igual: corren como 'postgres'.
create or replace function public.turno_perfil_solo_lo_suyo()
returns trigger
language plpgsql
set search_path = public
as $$
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
end $$;
