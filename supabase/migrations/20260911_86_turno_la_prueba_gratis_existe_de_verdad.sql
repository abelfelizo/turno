-- LA PRUEBA GRATIS EXISTE DE VERDAD
--
-- `constants.SUSCRIPCION.dias_prueba = 30` lleva meses en el repo y NO LO LEE
-- NADIE. Ni la app, ni la base. Es una promesa escrita en un archivo de
-- constantes: el mismo patrón que nos ha mordido cinco veces ya —una regla que
-- solo vive donde nadie la ejecuta no es una regla— solo que esta vez ni
-- siquiera llegaba a la interfaz.
--
-- Y debajo no había nada más: la migración 18 cuenta asientos, `lib/pricing.ts`
-- calcula cuánto tocaría pagar, y la pantalla del dueño enseña un monto con la
-- nota de que "el pago dentro de la app se habilitará próximamente". En la base
-- no existe el CONCEPTO de suscripción: ni quién está suscrito, ni desde cuándo,
-- ni hasta cuándo. Se puede decir el precio, pero no se puede responder a la
-- única pregunta que importa: ¿este local está al día?
--
-- LO QUE ESTA MIGRACIÓN HACE Y LO QUE NO.
--
-- HACE: el estado. Cada local tiene una fila que dice en qué situación está y
-- hasta qué día. Un local nuevo nace en PRUEBA, con 30 días contados desde que
-- se creó — que es exactamente lo que la constante prometía y nadie cumplía. Con
-- eso la pantalla puede decir algo cierto ("te quedan 18 días de prueba") en vez
-- de un precio que nadie está cobrando.
--
-- NO HACE: cobrar, y NO CORTA NADA. Ninguna función de este repo mira
-- `al_dia` para negarse. Es deliberado, por dos razones:
--
--   · La pasarela no está decidida (compra dentro de la app con IAP, o cobro
--     local), y esa decisión cambia qué se guarda aquí.
--   · Y sobre todo: qué pasa exactamente cuando alguien NO paga es una decisión
--     de producto, no técnica. ¿Se cierra la fila? ¿Se deja leer pero no
--     atender? ¿Hay gracia? Cortarle el local a un barbero un sábado por la
--     mañana por una decisión que nadie tomó a conciencia sería mucho peor que
--     no cobrar todavía.
--
-- Así que esto es el cimiento, y está dicho que es solo el cimiento. El día que
-- haya pasarela, lo que se añade es quién escribe `pagada_hasta`; el día que
-- haya política de corte, quién lee `al_dia`.
--
-- EL ESTADO SE CALCULA, NO SE GUARDA. La fila guarda FECHAS; si en vez de eso
-- guardara un texto 'activa'/'vencida', ese texto empieza a mentir en cuanto
-- pasa la medianoche y nadie lo actualiza. Guardar fechas y derivar el estado
-- al leerlo es lo único que no se desincroniza solo.

create table if not exists turno_suscripciones (
  negocio_id     uuid primary key references turno_negocios(id) on delete cascade,
  prueba_hasta   date,
  pagada_hasta   date,
  cortesia       boolean not null default false,
  nota           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table turno_suscripciones is
  'La situación de pago de cada local. Guarda FECHAS, no un estado: el estado se '
  'deriva al leerlo con turno_suscripcion(), para que no mienta al pasar la '
  'medianoche. Hoy NADA corta el servicio con esto — ver migración 86.';
comment on column turno_suscripciones.prueba_hasta is
  'Último día de la prueba gratis. Se siembra al crear el local.';
comment on column turno_suscripciones.pagada_hasta is
  'Último día cubierto por un pago. Null mientras no haya cobro. Lo escribirá '
  'la pasarela el día que exista; hoy no lo escribe nadie.';
comment on column turno_suscripciones.cortesia is
  'Local exento: piloto, prueba interna, acuerdo. Siempre al día, sin fecha.';

alter table turno_suscripciones enable row level security;

-- Solo el dueño ve la de su local. No hay política de escritura a propósito:
-- desde la app NADIE escribe aquí. Cuando exista la pasarela, escribirá con
-- service role o por una función con su propio portero — que es lo que hay que
-- revisar ese día, y por eso se queda cerrado hasta entonces.
drop policy if exists turno_suscripciones_select on turno_suscripciones;
create policy turno_suscripciones_select on turno_suscripciones
  for select to authenticated
  using (negocio_id in (select public.turno_negocios_admin()));

-- ── UN LOCAL NUEVO NACE EN PRUEBA ────────────────────────────────────────────
create or replace function turno_abrir_prueba()
returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  insert into turno_suscripciones (negocio_id, prueba_hasta)
  values (new.id, (new.created_at at time zone coalesce(new.tz, 'America/Santo_Domingo'))::date + 30)
  on conflict (negocio_id) do nothing;
  return new;
end $$;

comment on function turno_abrir_prueba is
  'Le abre 30 días de prueba al local recién creado. Los 30 son los de '
  'constants.SUSCRIPCION.dias_prueba, que hasta ahora no los leía nadie.';

drop trigger if exists trg_turno_abrir_prueba on turno_negocios;
create trigger trg_turno_abrir_prueba
  after insert on turno_negocios
  for each row execute function turno_abrir_prueba();

-- ── CÓMO ESTÁ ESTE LOCAL ─────────────────────────────────────────────────────
-- Devuelve lo que la pantalla necesita decir, ya resuelto. `al_dia` existe para
-- que el día que haya política de corte no haya que repetir esta aritmética en
-- cinco sitios distintos; hoy no lo mira nadie.
create or replace function turno_suscripcion(p_negocio uuid)
returns table (
  estado         text,   -- 'prueba' | 'activa' | 'vencida' | 'cortesia'
  al_dia         boolean,
  hasta          date,   -- el día que importa, sea de prueba o de pago
  dias_restantes int,    -- negativo si ya pasó
  asientos       int
)
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_row turno_suscripciones; v_hoy date; v_tz text; v_asientos int;
begin
  if public.turno_uid() is null then raise exception 'no autenticado'; end if;
  if not (p_negocio in (select public.turno_negocios_admin())) then
    raise exception 'sin acceso al negocio';
  end if;

  select coalesce(tz, 'America/Santo_Domingo') into v_tz from turno_negocios where id = p_negocio;
  if v_tz is null then raise exception 'ese local no existe'; end if;
  v_hoy := (now() at time zone v_tz)::date;

  select * into v_row from turno_suscripciones where negocio_id = p_negocio;
  v_asientos := public.turno_asientos_negocio(p_negocio);

  -- Sin fila: el local es anterior a esta migración y el backfill de abajo no
  -- lo alcanzó. Se trata como vencido, no se inventa una prueba nueva — si no,
  -- cada despliegue regalaría treinta días más.
  if v_row.negocio_id is null then
    return query select 'vencida'::text, false, null::date, null::int, v_asientos;
    return;
  end if;

  if v_row.cortesia then
    return query select 'cortesia'::text, true, null::date, null::int, v_asientos;
    return;
  end if;

  -- El pago manda sobre la prueba: quien pagó durante la prueba no pierde los
  -- días que le quedaban, se le suman por detrás.
  if v_row.pagada_hasta is not null and v_row.pagada_hasta >= v_hoy then
    return query select 'activa'::text, true, v_row.pagada_hasta,
                        (v_row.pagada_hasta - v_hoy)::int, v_asientos;
    return;
  end if;

  if v_row.prueba_hasta is not null and v_row.prueba_hasta >= v_hoy then
    return query select 'prueba'::text, true, v_row.prueba_hasta,
                        (v_row.prueba_hasta - v_hoy)::int, v_asientos;
    return;
  end if;

  -- Vencida: la fecha que se enseña es la última que lo cubrió, para que el
  -- dueño pueda ver desde cuándo debe en vez de un "vencida" a secas.
  return query select 'vencida'::text, false,
                      greatest(coalesce(v_row.pagada_hasta, '-infinity'::date),
                               coalesce(v_row.prueba_hasta, '-infinity'::date)),
                      (greatest(coalesce(v_row.pagada_hasta, '-infinity'::date),
                                coalesce(v_row.prueba_hasta, '-infinity'::date)) - v_hoy)::int,
                      v_asientos;
end $$;

comment on function turno_suscripcion is
  'En qué situación de pago está el local, ya resuelta. NADIE corta el servicio '
  'con esto todavía: qué pasa cuando alguien no paga es una decisión de '
  'producto sin tomar. Ver migración 86.';

grant execute on function turno_suscripcion(uuid) to authenticated;
revoke execute on function turno_suscripcion(uuid) from public, anon;

-- ── LOS LOCALES QUE YA EXISTÍAN ──────────────────────────────────────────────
-- Se les cuenta la prueba desde el día que se crearon, no desde hoy: son locales
-- de prueba del piloto y regalarles treinta días nuevos falsearía el dato desde
-- el primer minuto. A los que ya les habría caducado, les caduca.
insert into turno_suscripciones (negocio_id, prueba_hasta)
select n.id,
       (n.created_at at time zone coalesce(n.tz, 'America/Santo_Domingo'))::date + 30
  from turno_negocios n
on conflict (negocio_id) do nothing;
