-- LA FILA SIN BARBERO ASIGNADO TAMBIÉN OCUPA A ALGUIEN
--
-- Agujero encontrado repasando la migración 67 el mismo día de escribirla, no
-- reportado por nadie: hoy no se puede disparar, y por eso mismo convenía
-- cerrarlo antes de que alguien encienda el interruptor que lo abre.
--
-- turno_carga_de_fila contaba así:
--
--     where q.perfil_id = p_perfil and q.estado = 'en_fila'
--
-- Pero un turno puede entrar SIN barbero. Pasa cuando el cliente elige
-- "cualquiera disponible", y sobre todo cuando el local tiene activado
-- `asignacion_por_dueno`: ahí la fila entera nace sin dueño y el dueño la va
-- repartiendo. Para esos turnos, `perfil_id` es NULL, así que no contaban para
-- NINGÚN barbero: la carga daba 0 y la agenda volvía a ofrecer citas por encima
-- de una fila llena. Exactamente el fallo que la 67 vino a arreglar, entrando
-- por otra puerta.
--
-- Comprobado antes de tocar nada: los cuatro locales de la base tienen
-- `asignacion_por_dueno = false` y no hay ni un turno sin asignar, ni ahora ni
-- en el histórico. O sea que esto no está roto para nadie hoy — es una trampa
-- puesta para el día que alguien active esa casilla.
--
-- CÓMO SE REPARTE. Esos turnos se los va a comer alguien, pero todavía no se
-- sabe quién. Cargárselos enteros a cada barbero bloquearía de más (con 5
-- sueltos y 3 sillas, cada uno cargaría 5); ignorarlos bloquea de menos, que es
-- el fallo que tenemos. Se reparten entre las sillas que están aceptando, que
-- es lo que de verdad va a pasar cuando el dueño los asigne.
--
-- Es una estimación, y la espera SIEMPRE lo ha sido: lo que el sistema promete
-- es avisar cuando cambia (migración 62), no acertar el minuto.

create or replace function turno_carga_de_fila(p_perfil uuid)
returns int
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_gap int; v_espera int; v_dow int; v_tz text;
  v_neg uuid; v_sueltos int; v_sillas int;
begin
  if p_perfil is null then return 0; end if;

  select p.negocio_id, coalesce(n.tz, 'America/Santo_Domingo') into v_neg, v_tz
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id where p.id = p_perfil;
  if v_neg is null then return 0; end if;
  v_dow := extract(dow from (now() at time zone coalesce(v_tz, 'America/Santo_Domingo')));

  -- El respiro es del día que toca (migración 54).
  select coalesce(tiempo_entre_clientes, 0) into v_gap
    from turno_horarios
   where perfil_id = p_perfil and dia_semana = v_dow and activo
   order by hora_inicio limit 1;
  v_gap := coalesce(v_gap, 0);

  -- Lo que es suyo, seguro.
  select coalesce(sum(coalesce(s.duracion_min, 30) + v_gap), 0)::int into v_espera
    from turno_cola q
    left join turno_servicios s on s.id = q.servicio_id
   where q.perfil_id = p_perfil and q.estado = 'en_fila';

  -- Y su parte de lo que todavía no tiene dueño.
  select coalesce(sum(coalesce(s.duracion_min, 30) + v_gap), 0)::int into v_sueltos
    from turno_cola q
    left join turno_servicios s on s.id = q.servicio_id
   where q.negocio_id = v_neg and q.perfil_id is null and q.estado = 'en_fila';

  if v_sueltos > 0 then
    select greatest(1, count(*))::int into v_sillas
      from turno_perfiles p
     where p.negocio_id = v_neg and p.activo and p.aprobado
       and coalesce(p.estado_actual, 'disponible') = 'disponible';
    v_espera := v_espera + ceil(v_sueltos::numeric / v_sillas)::int;
  end if;

  -- turno_min_ocupada ya cubre al que está en la silla y los bloqueos vivos.
  return greatest(0, coalesce(public.turno_min_ocupada(p_perfil), 0) + coalesce(v_espera, 0));
end $$;

grant execute on function turno_carga_de_fila(uuid) to authenticated;
revoke execute on function turno_carga_de_fila(uuid) from public, anon;
