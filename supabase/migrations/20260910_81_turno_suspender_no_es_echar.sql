-- SUSPENDER NO ES ECHAR
--
-- Pedido desde el teléfono: "si el barbero es un empleado, el dueño debería
-- poder suspenderlo temporalmente sin tener que eliminarlo".
--
-- Hoy solo existe desvincular, que es definitivo: cancela sus citas futuras, lo
-- saca de la fila y lo echa del local. Para el empleado que no viene esta
-- semana, o al que se le manda a casa dos días, la única salida era echarlo y
-- volver a aprobarlo. Así que en la práctica no se usaba ninguna de las dos, y
-- el barbero seguía saliendo disponible en la app mientras no estaba.
--
-- No sirve `estado_actual = 'inactivo'`, que ya existe, POR UNA RAZÓN CONCRETA:
-- ese campo es del barbero. Lo pone y lo quita él desde su propia
-- configuración, así que una suspensión puesta ahí se deshace sola en cuanto el
-- suspendido abre su pantalla y pulsa "vuelvo". Una medida del dueño que el
-- afectado puede deshacer no es una medida.
--
-- Por eso una columna aparte, que solo escribe el dueño a través de una función
-- con portero. Mientras esté puesta:
--
--   · turno_perfil_acepta dice que no, así que no entra nadie a su fila ni le
--     reservan citas nuevas, y su silla sale "suspendida" en las tres pantallas.
--   · turno_perfil_operable dice que no, así que él tampoco puede llamar,
--     sentar ni cerrar turnos: suspendido es suspendido, no "invisible pero
--     trabajando".
--
-- LO QUE NO HACE, a propósito: no cancela sus citas ni vacía su fila. Una
-- suspensión de dos días no debería costarle a nadie las citas del mes que
-- viene, y si el dueño quiere eso, lo que quiere es desvincular.

alter table turno_perfiles add column if not exists suspendido boolean not null default false;
alter table turno_perfiles add column if not exists suspendido_motivo text;

comment on column turno_perfiles.suspendido is
  'Suspensión temporal puesta por el DUEÑO. Distinta de estado_actual, que es '
  'del barbero y él mismo puede quitar. Ver turno_suspender_barbero.';

create or replace function turno_suspender_barbero(p_perfil uuid, p_suspender boolean, p_motivo text default null)
returns void
language plpgsql security definer set search_path to 'public' as $$
declare v_neg uuid; v_usuario uuid;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;

  select negocio_id, usuario_id into v_neg, v_usuario from turno_perfiles where id = p_perfil;
  if v_neg is null then raise exception 'ese barbero no existe'; end if;
  if not (v_neg in (select public.turno_negocios_admin())) then
    raise exception 'solo el dueño del local puede suspender a alguien';
  end if;
  -- El dueño no se suspende a sí mismo: para cerrar su propia silla ya tiene
  -- "descanso" e "inactivo" en su configuración, que es donde lo buscaría.
  if v_usuario = public.turno_uid() then
    raise exception 'para cerrar tu propia silla usa tu estado, no una suspensión';
  end if;

  update turno_perfiles
     set suspendido = p_suspender,
         suspendido_motivo = case when p_suspender then nullif(trim(coalesce(p_motivo, '')), '') else null end
   where id = p_perfil;
end $$;

comment on function turno_suspender_barbero is
  'El dueño para o reanuda a un barbero sin echarlo del local. No toca sus '
  'citas ni su fila: para eso está desvincular.';

grant execute on function turno_suspender_barbero(uuid, boolean, text) to authenticated;

-- ── LA SUSPENSIÓN TIENE QUE VALER EN LAS DOS DIRECCIONES ─────────────────────
-- Que no le entre trabajo…
create or replace function turno_perfil_acepta(p_perfil uuid, p_fecha date default null)
returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare v_est text; v_modo text; v_susp boolean;
begin
  if p_perfil is null then return true; end if;

  select coalesce(pr.estado_actual, 'disponible'), coalesce(pr.modo_atencion, 'ambos'),
         coalesce(pr.suspendido, false)
    into v_est, v_modo, v_susp
    from turno_perfiles pr
   where pr.id = p_perfil and pr.activo and pr.aprobado;
  if v_est is null then return false; end if;

  -- Suspendido por el dueño: ni fila ni citas, ni hoy ni el mes que viene.
  if v_susp then return false; end if;

  if v_est = 'inactivo' then return false; end if;

  if v_est = 'descanso' and p_fecha is null then return false; end if;

  if p_fecha is null and v_modo = 'solo_citas' then return false; end if;
  if p_fecha is not null and v_modo = 'solo_fila' then return false; end if;

  return true;
end $$;

-- …y que tampoco pueda trabajar él.
create or replace function turno_perfil_operable(p_perfil uuid)
returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists(
    select 1 from public.turno_perfiles pr
     where pr.id = p_perfil
       and pr.activo and pr.aprobado
       and not coalesce(pr.suspendido, false)
       and (pr.usuario_id = public.turno_uid()
            or pr.negocio_id in (select public.turno_negocios_admin()))
  )
$$;

-- Y que la pantalla lo DIGA, en vez de enseñar una silla apagada sin motivo.
create or replace function turno_fila_abierta(p_perfil uuid, p_negocio uuid default null)
returns text
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_neg uuid; v_tz text; v_ahora timestamp; v_dow int;
  v_ini time; v_fin time; v_tiene_horario boolean; v_abierto boolean;
  v_est text; v_modo text; v_susp boolean; v_motivo text;
begin
  if p_perfil is null then
    if p_negocio is null then return null; end if;
    select coalesce(tz, 'America/Santo_Domingo') into v_tz from turno_negocios where id = p_negocio;
    v_ahora := (now() at time zone coalesce(v_tz, 'America/Santo_Domingo'));
    v_dow := extract(dow from v_ahora);
    select exists(
      select 1 from turno_perfiles p
        join turno_horarios h on h.perfil_id = p.id
       where p.negocio_id = p_negocio and p.activo and p.aprobado
         and h.dia_semana = v_dow and h.activo
         and v_ahora::time >= h.hora_inicio and v_ahora::time < h.hora_fin
         and public.turno_perfil_acepta(p.id, null)
    ) into v_abierto;
    if v_abierto then return null; end if;
    return 'ahora mismo no hay nadie abierto en el local';
  end if;

  select p.negocio_id, coalesce(n.tz, 'America/Santo_Domingo'),
         coalesce(p.estado_actual, 'disponible'), coalesce(p.modo_atencion, 'ambos'),
         coalesce(p.suspendido, false), p.suspendido_motivo
    into v_neg, v_tz, v_est, v_modo, v_susp, v_motivo
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id
   where p.id = p_perfil and p.activo and p.aprobado;
  if v_neg is null then return 'no está disponible'; end if;

  -- El motivo del dueño, si lo escribió; si no, algo neutro. Nunca "no ha
  -- puesto su horario" a alguien que está suspendido: eso confunde a todos.
  if v_susp then return coalesce(nullif(trim(v_motivo), ''), 'no está atendiendo por ahora'); end if;

  if not public.turno_perfil_acepta(p_perfil, null) then
    if v_est = 'inactivo' then return 'no está trabajando ahora mismo'; end if;
    if v_est = 'descanso' then return 'está en descanso'; end if;
    if v_modo = 'solo_citas' then return 'solo trabaja con cita'; end if;
    return 'no está tomando clientes ahora mismo';
  end if;

  v_ahora := (now() at time zone v_tz);
  v_dow := extract(dow from v_ahora);

  select exists(select 1 from turno_horarios where perfil_id = p_perfil) into v_tiene_horario;
  if not v_tiene_horario then
    return 'todavía no ha puesto su horario, así que su fila no está abierta';
  end if;

  select hora_inicio, hora_fin into v_ini, v_fin
    from turno_horarios
   where perfil_id = p_perfil and dia_semana = v_dow and activo
   order by hora_inicio limit 1;

  if v_ini is null then return 'hoy no trabaja: su fila abre los días que tiene marcados'; end if;
  if v_ahora::time < v_ini or v_ahora::time >= v_fin then
    return 'ahora está cerrado: su fila abre de ' || to_char(v_ini, 'HH24:MI')
        || ' a ' || to_char(v_fin, 'HH24:MI');
  end if;

  return null;
end $$;
