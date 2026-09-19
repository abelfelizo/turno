-- CADA SILLA PAGA LA SUYA
--
-- Viene de la misma conversación que la 92:
--
--   «El barbero que alquila un asiento y paga su aplicación pero la barbería no
--    la paga, él maneja lo de él de manera independiente a la barbería.»
--
-- La migración 86 puso la suscripción con el negocio como única clave:
-- turno_suscripciones tiene `negocio_id` de primary key. Con eso, ese barbero
-- NO EXISTE: no hay forma de que pague lo suyo si su local no paga, ni de que
-- su local pagando le cubra a él sin cubrir a todos. La única pregunta que la
-- 86 sabía contestar era «¿está al día este LOCAL?».
--
-- ── QUIÉN PAGA, SEGÚN LA MODALIDAD ──────────────────────────────────────────
-- La decisión, tomada:
--
--   · LOCAL DE ASIENTOS ALQUILADOS → paga CADA SILLA, la del dueño incluida si
--     él además atiende. El local como tal no paga nada: agrupar no cuesta.
--   · LOCAL DE EMPLEADOS → paga EL LOCAL, como hasta ahora.
--
-- Es la misma forma que R11 y que la 92: **la modalidad del LOCAL decide**.
-- Aquí se mira el tipo del negocio y no la autonomía de la persona, y es a
-- propósito: en un local de empleados el dueño también es «autónomo» por
-- membresía, y si la regla mirase eso, el dueño de una barbería de empleados
-- acabaría con una suscripción de silla aparte de la de su propio local. La
-- pregunta no es «¿este señor manda en lo suyo?» sino «¿cómo se cobra en esta
-- casa?».
--
-- ── LA PRUEBA SE SIEMBRA SIEMPRE, Y ES A PROPÓSITO ──────────────────────────
-- El trigger abre 30 días a TODA silla nueva, también en locales de empleados
-- donde nadie va a leer esa fila. Sembrarla solo en los alquilados sería más
-- «limpio» y dejaría una trampa: turno_cambiar_tipo_negocio permite pasar un
-- local de empleados a asientos alquilados, y ese día todas sus sillas
-- aparecerían vencidas de golpe sin que nadie hubiera dejado de pagar. Una fila
-- que nadie lee no molesta; una barbería entera cortada un martes, sí.
--
-- ── Y NADIE CORTA NADA ──────────────────────────────────────────────────────
-- Igual que la 86: esto GUARDA Y CALCULA el estado, no lo aplica. Qué pasa
-- cuando alguien no paga sigue siendo una decisión de producto sin tomar, y
-- cortarle la silla a un barbero un sábado por una regla que se coló sin querer
-- sería mucho peor que no cobrar. La suite tiene el caso puesto a propósito
-- para que el día que esa decisión se tome, se tome mirándola.

-- ── LA TABLA ────────────────────────────────────────────────────────────────
create table if not exists turno_suscripciones_silla (
  perfil_id   uuid primary key references turno_perfiles(id) on delete cascade,
  prueba_hasta date,
  pagada_hasta date,
  cortesia    boolean not null default false,
  nota        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table turno_suscripciones_silla enable row level security;

-- Lo que paga —o debe— un barbero es de lo más privado que hay aquí dentro, y
-- en un local de asientos alquilados su casero NO es parte. Por eso la puerta
-- es turno_manda_en_la_silla y no «pertenezco al local».
drop policy if exists turno_suscripciones_silla_select on turno_suscripciones_silla;
create policy turno_suscripciones_silla_select on turno_suscripciones_silla
  for select to authenticated
  using (public.turno_manda_en_la_silla(perfil_id));

-- Sin política de escritura, igual que turno_suscripciones: nadie cobra desde
-- la app todavía. El día que haya pasarela, escribirá el servidor.

create index if not exists turno_suscripciones_silla_pagada_idx
  on turno_suscripciones_silla (pagada_hasta);

-- ── LA PRUEBA GRATIS DE CADA SILLA ──────────────────────────────────────────
create or replace function turno_abrir_prueba_silla()
returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_tz text;
begin
  select coalesce(n.tz, 'America/Santo_Domingo') into v_tz
    from turno_negocios n where n.id = new.negocio_id;
  insert into turno_suscripciones_silla (perfil_id, prueba_hasta)
  values (new.id,
          (coalesce(new.created_at, now()) at time zone coalesce(v_tz, 'America/Santo_Domingo'))::date + 30)
  on conflict (perfil_id) do nothing;
  return new;
end $$;

drop trigger if exists turno_abrir_prueba_silla_ins on turno_perfiles;
create trigger turno_abrir_prueba_silla_ins
  after insert on turno_perfiles
  for each row execute function turno_abrir_prueba_silla();

-- Y al aprobarlo, por si el perfil nació antes de que existiera esta tabla.
drop trigger if exists turno_abrir_prueba_silla_apr on turno_perfiles;
create trigger turno_abrir_prueba_silla_apr
  after update of aprobado on turno_perfiles
  for each row
  when (coalesce(new.aprobado, false) and not coalesce(old.aprobado, false))
  execute function turno_abrir_prueba_silla();

-- Las sillas que ya existían reciben 30 días DESDE HOY, no desde su created_at.
-- Contarles hacia atrás una prueba que no existía cuando se dieron de alta las
-- dejaría a todas vencidas el día que se aplica esta migración: el piloto
-- entero amaneciendo en rojo por una cuenta retroactiva. La prueba de una silla
-- empieza cuando la silla puede pagarla, y eso es hoy.
insert into turno_suscripciones_silla (perfil_id, prueba_hasta)
select p.id,
       (now() at time zone coalesce(n.tz, 'America/Santo_Domingo'))::date + 30
  from turno_perfiles p join turno_negocios n on n.id = p.negocio_id
on conflict (perfil_id) do nothing;

-- ── ¿ESTÁ AL DÍA ESTA SILLA? ────────────────────────────────────────────────
-- Mismo cálculo que turno_suscripcion, sin `asientos`: una silla es una silla.
create or replace function turno_suscripcion_silla(p_perfil uuid)
returns table (estado text, al_dia boolean, hasta date, dias_restantes int)
language plpgsql stable security definer set search_path to 'public' as $$
declare v_row turno_suscripciones_silla; v_hoy date; v_tz text;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not public.turno_manda_en_la_silla(p_perfil) then
    raise exception 'esa silla no es tuya';
  end if;

  select coalesce(n.tz, 'America/Santo_Domingo') into v_tz
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id
   where p.id = p_perfil;
  if v_tz is null then raise exception 'esa silla no existe'; end if;
  v_hoy := (now() at time zone v_tz)::date;

  select * into v_row from turno_suscripciones_silla where perfil_id = p_perfil;

  if v_row.perfil_id is null then
    return query select 'vencida'::text, false, null::date, null::int; return;
  end if;
  if v_row.cortesia then
    return query select 'cortesia'::text, true, null::date, null::int; return;
  end if;
  if v_row.pagada_hasta is not null and v_row.pagada_hasta >= v_hoy then
    return query select 'activa'::text, true, v_row.pagada_hasta,
                        (v_row.pagada_hasta - v_hoy)::int; return;
  end if;
  if v_row.prueba_hasta is not null and v_row.prueba_hasta >= v_hoy then
    return query select 'prueba'::text, true, v_row.prueba_hasta,
                        (v_row.prueba_hasta - v_hoy)::int; return;
  end if;
  return query select 'vencida'::text, false,
                      greatest(coalesce(v_row.pagada_hasta, '-infinity'::date),
                               coalesce(v_row.prueba_hasta, '-infinity'::date)),
                      (greatest(coalesce(v_row.pagada_hasta, '-infinity'::date),
                                coalesce(v_row.prueba_hasta, '-infinity'::date)) - v_hoy)::int;
end $$;

comment on function turno_suscripcion_silla is
  'La suscripción de UNA silla. La lee quien manda en ella: su barbero, y la '
  'barbería solo si es empleado. Ver migración 93.';

grant execute on function turno_suscripcion_silla(uuid) to authenticated;
revoke execute on function turno_suscripcion_silla(uuid) from public, anon;

-- ── LA QUE HAY QUE PREGUNTAR: ¿QUIÉN PAGA POR ESTA SILLA? ───────────────────
-- Una sola puerta para la app, para que la regla de quién paga no se reparta
-- entre pantallas. Devuelve además `quien` para poder decirlo con palabras:
-- «tu suscripción» no es lo mismo que «la de tu barbería».
create or replace function turno_suscripcion_de(p_perfil uuid)
returns table (estado text, al_dia boolean, hasta date, dias_restantes int, quien text)
language plpgsql stable security definer set search_path to 'public' as $$
declare v_tipo text; v_neg uuid;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not public.turno_manda_en_la_silla(p_perfil) then
    raise exception 'esa silla no es tuya';
  end if;

  select p.negocio_id, n.tipo into v_neg, v_tipo
    from turno_perfiles p join turno_negocios n on n.id = p.negocio_id
   where p.id = p_perfil;
  if v_neg is null then raise exception 'esa silla no existe'; end if;

  if v_tipo = 'espacios_rentados' then
    return query select s.estado, s.al_dia, s.hasta, s.dias_restantes, 'silla'::text
      from public.turno_suscripcion_silla(p_perfil) s;
    return;
  end if;

  -- Local de empleados: paga la barbería. Pero lo que paga —o debe— un local
  -- no es asunto de sus empleados, y turno_suscripcion se niega a quien no es
  -- dueño. Así que al empleado se le dice lo único que le concierne: que no le
  -- toca a él. Sin fechas y sin al_dia, porque no los puede saber.
  if not (v_neg in (select public.turno_negocios_admin())) then
    return query select 'la_cubre_el_local'::text, null::boolean, null::date, null::int, 'local'::text;
    return;
  end if;

  return query select s.estado, s.al_dia, s.hasta, s.dias_restantes, 'local'::text
    from public.turno_suscripcion(v_neg) s;
end $$;

comment on function turno_suscripcion_de is
  'Quién paga por esta silla y cómo va: en un local de asientos alquilados, '
  'ella misma; en uno de empleados, la barbería. La modalidad del LOCAL decide, '
  'igual que R11. Ver migración 93.';

grant execute on function turno_suscripcion_de(uuid) to authenticated;
revoke execute on function turno_suscripcion_de(uuid) from public, anon;
