-- FIDELIDAD POR VISITAS, NO POR PUNTOS ABSTRACTOS
--
-- Aclaración de producto (sep-2026): "no necesariamente son puntos sino visitas
-- o recortes: cada X recortes te ganas esto, y eso es lo que debería poder
-- configurar el barbero, o el dueño si tiene empleados".
--
-- El sistema anterior tenía dos números donde hace falta uno (puntos por visita
-- × visitas para el premio) y ningún sitio para decir CUÁL es el premio: la app
-- decía "corte gratis" a fuego, aunque el barbero quisiera regalar una barba o
-- un refresco. Y arrastraba una incoherencia real:
--
--   · el trigger acumulaba según el barbero cuando era rentado,
--   · pero el canje y la pantalla del cliente leían siempre la del negocio.
--
-- Los números no cuadraban y el cliente podía ver un premio que el canje le
-- negaba. De fondo: el saldo era por (cliente, local) mientras la regla podía
-- ser por barbero, así que dos rentados con reglas distintas compartían saldo.
--
-- MODELO NUEVO, con una sola idea: la tarjeta pertenece a quien pone la regla,
-- que es exactamente la regla R11 aplicada a la fidelidad.
--
--   Local de empleados  → la regla y la tarjeta son del LOCAL   (perfil_id NULL)
--   Barbero que renta   → la regla y la tarjeta son del BARBERO (perfil_id)
--
-- Así el cliente de un local de empleados junta recortes con la barbería, vaya
-- con quien vaya; y el que va a un rentado junta con SU barbero, que es de
-- quien recibe el premio. Ninguna de las dos frases necesita explicación.

-- ── 1. El premio deja de estar a fuego ────────────────────────────────────────
alter table turno_configuracion_negocio add column if not exists premio text;
alter table turno_perfiles              add column if not exists premio text;

update turno_configuracion_negocio set premio = 'Corte gratis'
 where puntos_activos and (premio is null or btrim(premio) = '');
update turno_perfiles set premio = 'Corte gratis'
 where puntos_activos and (premio is null or btrim(premio) = '');

-- ── 2. La tarjeta tiene ámbito, y cuenta visitas ──────────────────────────────
alter table turno_puntos add column if not exists perfil_id uuid
  references turno_perfiles(id) on delete cascade;

alter table turno_puntos rename column puntos_totales   to visitas_totales;
alter table turno_puntos rename column puntos_canjeados to visitas_canjeadas;

drop index if exists turno_puntos_usuario_negocio_uk;
-- nulls not distinct: sin esto, PostgreSQL trataría cada NULL como distinto y
-- un mismo cliente podría acumular varias tarjetas del local en paralelo.
create unique index if not exists turno_puntos_uk
  on turno_puntos (usuario_id, negocio_id, perfil_id) nulls not distinct;

-- El premio prometido se congela en el vale: si el barbero lo cambia mañana,
-- quien ya lo ganó cobra lo que se le prometió.
alter table turno_canjes add column if not exists premio text;
alter table turno_canjes rename column puntos_costo to visitas_costo;

-- ── 3. Un solo sitio que decide de quién es la regla ─────────────────────────
create or replace function turno_fidelidad(p_perfil uuid, p_negocio uuid)
returns table(activo boolean, meta int, premio text, ambito text, perfil uuid)
language plpgsql stable security definer set search_path to 'public' as $$
declare v_act boolean; v_meta int; v_premio text;
begin
  -- El barbero autónomo con su propio programa manda sobre su silla.
  if p_perfil is not null and public.turno_perfil_autonomo(p_perfil) then
    select pf.puntos_activos, pf.puntos_meta, pf.premio
      into v_act, v_meta, v_premio
      from turno_perfiles pf where pf.id = p_perfil;
    if coalesce(v_act, false) then
      return query select true, coalesce(nullif(v_meta, 0), 8),
                          coalesce(nullif(btrim(v_premio), ''), 'Corte gratis'),
                          'perfil'::text, p_perfil;
      return;
    end if;
  end if;

  select c.puntos_activos, c.visitas_para_gratis, c.premio
    into v_act, v_meta, v_premio
    from turno_configuracion_negocio c where c.negocio_id = p_negocio;
  return query select coalesce(v_act, false), coalesce(nullif(v_meta, 0), 8),
                      coalesce(nullif(btrim(v_premio), ''), 'Corte gratis'),
                      'negocio'::text, null::uuid;
end $$;

-- ── 4. Acumular: una visita es una visita ────────────────────────────────────
create or replace function turno_acumular_puntos()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare f record;
begin
  select * into f from public.turno_fidelidad(NEW.perfil_id, NEW.negocio_id);
  if not f.activo then return NEW; end if;

  insert into turno_puntos(usuario_id, negocio_id, perfil_id, visitas_totales)
  values (NEW.cliente_id, NEW.negocio_id, f.perfil, 1)
  on conflict (usuario_id, negocio_id, perfil_id)
  do update set visitas_totales = turno_puntos.visitas_totales + 1, updated_at = now();
  return NEW;
end $$;

-- ── 5. Canjear: mismas reglas con las que se acumuló ─────────────────────────
create or replace function turno_emitir_canje(p_negocio uuid, p_perfil uuid default null)
returns turno_canjes language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := public.turno_uid(); f record; v_disp int; v_row turno_canjes;
begin
  if v_uid is null then raise exception 'no autenticado'; end if;
  select * into f from public.turno_fidelidad(p_perfil, p_negocio);
  if not f.activo then raise exception 'este local no tiene programa de fidelidad'; end if;

  select coalesce(visitas_totales, 0) - coalesce(visitas_canjeadas, 0) into v_disp
    from turno_puntos
   where usuario_id = v_uid and negocio_id = p_negocio
     and perfil_id is not distinct from f.perfil;

  if coalesce(v_disp, 0) < f.meta then
    raise exception 'te faltan % visitas', f.meta - coalesce(v_disp, 0);
  end if;

  update turno_puntos
     set visitas_canjeadas = coalesce(visitas_canjeadas, 0) + f.meta, updated_at = now()
   where usuario_id = v_uid and negocio_id = p_negocio
     and perfil_id is not distinct from f.perfil;

  insert into turno_canjes(usuario_id, negocio_id, perfil_id, visitas_costo, premio)
    values (v_uid, p_negocio, f.perfil, f.meta, f.premio) returning * into v_row;
  return v_row;
end $$;

-- ── 6. Recontar desde la fuente de verdad ────────────────────────────────────
-- Los saldos viejos estaban en puntos (podían ser 10 por visita) y sin ámbito.
-- El historial de visitas es el hecho; el saldo, una vista acumulada de él. Se
-- recalcula en vez de intentar convertir, que daría números inventados.
delete from turno_puntos;

insert into turno_puntos (usuario_id, negocio_id, perfil_id, visitas_totales)
select hv.cliente_id, hv.negocio_id, f.perfil, count(*)
  from turno_historial_visitas hv
  cross join lateral public.turno_fidelidad(hv.perfil_id, hv.negocio_id) f
 where f.activo
 group by hv.cliente_id, hv.negocio_id, f.perfil;

-- Los vales ya emitidos se descuentan para no regalar dos veces lo mismo.
update turno_puntos p
   set visitas_canjeadas = c.total
  from (select usuario_id, negocio_id, perfil_id, sum(visitas_costo) as total
          from turno_canjes group by 1, 2, 3) c
 where p.usuario_id = c.usuario_id and p.negocio_id = c.negocio_id
   and p.perfil_id is not distinct from c.perfil_id;

grant execute on function turno_fidelidad(uuid, uuid) to authenticated;
