-- R5 (parte citas): reserva grupal de N espacios consecutivos con el mismo
-- barbero (p. ej. un padre + sus hijos), enlazados por grupo_id. No toca la
-- cola ni el índice único (cliente_id, tipo_servicio) de R1.

create or replace function turno_agendar_grupo(p_perfil uuid, p_servicio uuid, p_fecha date, p_hora time, p_personas int)
returns setof turno_citas language plpgsql security definer set search_path to 'public' as $$
declare v_cli uuid := public.turno_uid(); v_neg uuid; v_dur int;
        v_grupo uuid := gen_random_uuid(); v_ini time; v_fin time; i int;
begin
  if v_cli is null then raise exception 'no autenticado'; end if;
  if p_personas < 1 or p_personas > 6 then raise exception 'cantidad de personas invalida'; end if;
  select negocio_id into v_neg from turno_perfiles where id = p_perfil;
  if v_neg is null then raise exception 'perfil invalido'; end if;
  if not (v_neg in (select public.turno_mis_negocios())) then raise exception 'sin acceso al negocio'; end if;
  select duracion_min into v_dur from turno_servicios where id = p_servicio;
  if v_dur is null then raise exception 'servicio invalido'; end if;
  if (p_fecha + p_hora) < now()::timestamp then raise exception 'horario en el pasado'; end if;

  for i in 0..(p_personas - 1) loop
    v_ini := (p_hora + make_interval(mins => v_dur * i))::time;
    v_fin := (p_hora + make_interval(mins => v_dur * (i + 1)))::time;
    if exists (select 1 from turno_citas c
         where c.perfil_id = p_perfil and c.fecha = p_fecha
           and c.estado in ('creada','confirmada','en_camino')
           and c.hora_inicio < v_fin and c.hora_fin > v_ini) then
      raise exception 'no hay % espacios seguidos desde esa hora', p_personas;
    end if;
    insert into turno_citas(perfil_id, cliente_id, negocio_id, servicio_id, fecha, hora_inicio, hora_fin, estado, grupo_id)
    values (p_perfil, v_cli, v_neg, p_servicio, p_fecha, v_ini, v_fin, 'creada', v_grupo);
  end loop;

  return query select * from turno_citas where grupo_id = v_grupo order by hora_inicio;
end $$;
