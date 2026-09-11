-- QUIÉN DEJA ENTRAR A QUIÉN
--
-- El esquema, dicho entero desde el teléfono y ya sin matices:
--
--   · CLIENTES → nunca pagan.
--   · BARBEROS → siempre se paga por ellos.
--   · DUEÑOS   → no pagan si tienen barberos independientes: solo los AGRUPAN,
--                no los controlan, y «ellos se agregan a la barbería».
--                Pagan si son empleados: los controlan, y «solo él puede
--                agregarlos a la barbería».
--
-- Las migraciones 92 y 93 ya repartieron el MANDO y el PAGO con esa forma. Lo
-- que quedaba fuera del esquema era la PUERTA DE ENTRADA, que trataba a los dos
-- locales igual: turno_unirse_profesional metía a todo el mundo con
-- `aprobado = false`, viniera de donde viniera.
--
-- Y eso es incoherente con lo que la 92 dejó escrito. Si el dueño de un local
-- de asientos alquilados no manda en la silla de quien le renta —no le opera la
-- fila, no le lee la cartera, no le lee las cuentas— tampoco tiene por qué darle
-- permiso para empezar a trabajar. Tenerlo esperando aprobación era la última
-- pieza de «te dirijo» que quedaba en pie.
--
--   · ASIENTOS ALQUILADOS → el barbero entra con el código y queda ACTIVO. Se
--     agrega él. Agrupar es decir quién está en el grupo, no autorizar a
--     trabajar.
--   · EMPLEADOS → entra pendiente, como hasta ahora. Sin el visto bueno del
--     dueño no tiene silla, y eso es exactamente «solo él puede agregarlos».
--
-- LA CONTRAPARTIDA, DICHA EN VOZ ALTA: en un local de asientos alquilados,
-- cualquiera que tenga el código aparece en la fachada del local sin que el
-- dueño lo apruebe. Es el precio de «no los controla», y no queda desprotegido:
-- el código es privado (migración 57, no se puede listar), y al dueño le quedan
-- las dos llaves que SÍ son suyas —suspender, que desde la 92 significa «te
-- saco de la fila y de la fachada», y desvincular, que es terminar el trato—.
-- Lo que no tiene es una tercera llave para decidir si el otro puede trabajar.

create or replace function turno_unirse_profesional(
  p_codigo text, p_tipo_servicio text, p_rol text, p_nombre text, p_telefono text)
returns turno_perfiles
language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid; v_neg uuid; v_tipo text; v_rol text;
  v_perfil public.turno_perfiles; v_entra_aprobado boolean;
begin
  if auth.uid() is null then raise exception 'no autenticado'; end if;
  select id, tipo into v_neg, v_tipo from turno_negocios where codigo_acceso = upper(p_codigo) and activo;
  if v_neg is null then raise exception 'codigo invalido'; end if;

  -- El rol lo pone el LOCAL, no quien pide entrar (migración 38). `p_rol` sigue
  -- en la firma por compatibilidad con la app, y se ignora a propósito.
  v_rol := case when v_tipo = 'espacios_rentados' then 'barbero_renta' else 'empleado' end;
  -- Y la aprobación va con el mismo interruptor: quien no dirige, no autoriza.
  v_entra_aprobado := (v_tipo = 'espacios_rentados');

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
    insert into turno_perfiles(usuario_id,negocio_id,tipo_servicio,activo,aprobado,estado_actual)
    values(v_uid,v_neg,coalesce(p_tipo_servicio,'barbero'),true,v_entra_aprobado,'disponible')
    returning * into v_perfil;
  end if;
  return v_perfil;
end $$;

comment on function turno_unirse_profesional is
  'Alta de un profesional con el código del local. El rol Y la aprobación los '
  'pone la modalidad del local: en asientos alquilados entra activo —se agrega '
  'él, el dueño no lo dirige (migración 92)—; con empleados entra pendiente, '
  'porque ahí solo el dueño lo mete. Ver migraciones 38 y 94.';

grant execute on function turno_unirse_profesional(text, text, text, text, text) to authenticated;
revoke execute on function turno_unirse_profesional(text, text, text, text, text) from public, anon;
