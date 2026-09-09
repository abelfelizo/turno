-- EL ORDEN DE LA FILA ES UNA REGLA, NO UNA SUGERENCIA
--
-- Corrección del piloto: "el barbero no puede adelantar a nadie, eso rompe las
-- reglas. La regla es: quien hace cita tiene la prioridad, sigue el que se mete
-- en la fila, walk-in solo si no hay nadie en fila."
--
-- El orden ya estaba bien implementado —la columna `prioridad` es exactamente
-- eso: 1 cita, 2 fila digital, 3 sin cita— pero yo le había puesto al barbero
-- dos herramientas para saltárselo:
--
--   turno_mover_en_cola   subir o bajar a alguien de puesto
--   turno_llamar_a        llamar a quien sea, "se salta el orden"
--
-- Eso no es una función de más: rompe la promesa que el cliente ve en su
-- pantalla. La app le dice "eres el 3º y te faltan 20 minutos", y esos botones
-- convierten ese número en una estimación sin valor. Quien reserva una cita lo
-- hace para no depender de a quién le caiga mejor al barbero.
--
-- QUÉ SE QUITA Y QUÉ SE DEJA:
--
--   · mover_en_cola  -> se niega. No hay reordenar legítimo.
--   · llamar_a       -> solo si esa persona ES la siguiente en el orden. Sirve
--                       para lo que sí hacía falta (llamar tocando su fila en
--                       vez del botón grande) y deja de servir para adelantar.
--   · sacar_de_cola  -> se queda. Alguien que se fue del local tiene que poder
--                       salir, y eso no adelanta a nadie: los de detrás suben
--                       porque uno desapareció, no porque se les pase por
--                       delante.
--   · devolver_a_fila-> se queda, conserva su puesto.
--
-- Las dos funciones siguen existiendo en vez de borrarse: una app instalada que
-- todavía las llame debe recibir un "no se puede" con explicación, no un fallo
-- de función inexistente.

-- Conserva su tipo de retorno original (void): cambiarlo obligaría a un DROP, y
-- una app instalada que todavía la llame debe recibir el mensaje, no un error de
-- función inexistente.
create or replace function turno_mover_en_cola(p_cola uuid, p_delta int)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.turno_cola_operable(p_cola);
  raise exception 'el orden de la fila no se cambia a mano: primero quien tiene cita, después quien está en la fila, y quien llega sin cita cuando no queda nadie esperando';
end $$;

-- Llamar tocando a alguien en la lista está bien; adelantarlo no. Se comprueba
-- que sea de verdad el siguiente según (prioridad, posicion), que es el mismo
-- orden que usa turno_llamar_siguiente.
create or replace function turno_llamar_a(p_cola uuid)
returns turno_cola language plpgsql security definer set search_path to 'public' as $$
declare v public.turno_cola; v_sig uuid; v_ventana int;
begin
  v := public.turno_cola_operable(p_cola);
  if v.estado <> 'en_fila' then raise exception 'ese turno no está esperando'; end if;

  select q.id into v_sig
    from turno_cola q
   where q.negocio_id = v.negocio_id and q.estado = 'en_fila'
     and (v.perfil_id is null or q.perfil_id is null or q.perfil_id = v.perfil_id)
   order by q.prioridad asc, q.posicion asc
   limit 1;

  if v_sig is distinct from p_cola then
    raise exception 'no puedes adelantarlo: hay alguien antes en la fila';
  end if;

  v_ventana := public.turno_regla_tiempo(v.perfil_id, v.negocio_id, 'ventana_llegada_min');
  update turno_cola
     set estado = 'llamado', llamado_at = now(),
         expira_at = now() + make_interval(mins => v_ventana)
   where id = p_cola
   returning * into v;
  return v;
end $$;
