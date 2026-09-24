-- UNA BARBERÍA NACE ABIERTA
--
-- Desde la migración 72 la fila respeta el horario, y desde la 74 hay un letrero
-- que dice por qué está cerrada. Las dos son correctas. Juntas dejaron un
-- agujero que nadie miró: NADA SIEMBRA UN HORARIO.
--
-- Reproducido contra la base, creando un local desde cero:
--
--   horarios sembrados: 0
--   la silla del dueño: «todavía no ha puesto su horario, así que su fila no
--                        está abierta»
--   el local entero:    «ahora mismo no hay nadie abierto en el local»
--
-- Es decir: alguien se descarga la app, monta su barbería, comparte el código
-- con sus clientes — y no le puede entrar ni una persona. La app no está rota y
-- no da ningún error: simplemente no pasa nada, que es la peor forma de estar
-- rota. Y el único sitio donde lo dice es la tarjeta de estado de su propia
-- fila, que es justo la que no mira quien acaba de registrarse.
--
-- Lo mismo con cada empleado que el dueño aprueba: entra al equipo con la silla
-- apagada y sin saberlo.
--
-- LA DECISIÓN. Se siembra una jornada por defecto en el momento en que el perfil
-- PUEDE trabajar: al crearlo ya aprobado (el del dueño, que lo crea
-- turno_crear_negocio) y al aprobarlo (el del empleado). De lunes a sábado, de
-- 09:00 a 18:00, sin tiempo entre clientes.
--
-- Esas horas no son un invento: son EXACTAMENTE las que ya propone el editor de
-- horario de la app cuando el barbero abre un día en blanco. Así lo que hay
-- sembrado y lo que vería al entrar a configurarlo son lo mismo, y cambiarlo no
-- le sorprende. El domingo queda cerrado, que es lo normal aquí.
--
-- EL RIESGO, DICHO. Una jornada por defecto puede no ser la suya, y entonces le
-- entra gente a una hora en la que no está. Es un riesgo real y por eso NO se
-- esconde: el perfil queda marcado con jornada_sembrada, la app avisa de que ese
-- horario lo puso el sistema, y la marca se borra sola en cuanto el barbero
-- guarda un día. Nacer abierto con un horario que se puede corregir es mejor que
-- nacer cerrado sin decirlo.
--
-- SOLO SI NO TIENE NINGUNO. Si el perfil ya tiene horarios —porque volvió al
-- local, porque el dueño se lo puso antes de aprobarlo— no se toca nada.

alter table turno_perfiles
  add column if not exists jornada_sembrada boolean not null default false;

comment on column turno_perfiles.jornada_sembrada is
  'El horario que tiene ahora lo puso el sistema al aprobarlo, no él. Sirve '
  'para que la app lo avise. Se apaga en cuanto guarda un día a mano.';

create or replace function turno_sembrar_jornada()
returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  -- Solo cuando el perfil pasa a poder trabajar, y solo si está en blanco.
  if not coalesce(new.aprobado, false) or not coalesce(new.activo, false) then
    return new;
  end if;
  if exists (select 1 from turno_horarios where perfil_id = new.id) then
    return new;
  end if;

  insert into turno_horarios (perfil_id, dia_semana, hora_inicio, hora_fin, activo, tiempo_entre_clientes)
  select new.id, d, time '09:00', time '18:00', true, 0
    from generate_series(1, 6) d;   -- lunes(1) a sábado(6); domingo(0) cerrado

  update turno_perfiles set jornada_sembrada = true where id = new.id;
  return new;
end $$;

comment on function turno_sembrar_jornada is
  'Le pone una jornada por defecto al perfil que acaba de poder trabajar, para '
  'que no nazca con la fila cerrada sin decirlo. Ver migración 85.';

-- AFTER, no BEFORE: hace falta que la fila del perfil exista para que el INSERT
-- en turno_horarios no rompa la clave foránea.
drop trigger if exists trg_turno_sembrar_jornada_alta on turno_perfiles;
create trigger trg_turno_sembrar_jornada_alta
  after insert on turno_perfiles
  for each row execute function turno_sembrar_jornada();

-- Al aprobar. `of aprobado` para no correrlo en cada guardado del perfil, y la
-- condición para que solo sea el salto de no-aprobado a aprobado.
drop trigger if exists trg_turno_sembrar_jornada_aprobacion on turno_perfiles;
create trigger trg_turno_sembrar_jornada_aprobacion
  after update of aprobado on turno_perfiles
  for each row
  when (coalesce(new.aprobado, false) and not coalesce(old.aprobado, false))
  execute function turno_sembrar_jornada();

-- ── LOS QUE YA ESTABAN ───────────────────────────────────────────────────────
-- El disparador solo vale para los que vengan. Los perfiles que ya existen
-- aprobados y sin un solo horario llevan su fila cerrada desde que se dieron de
-- alta, sin saberlo. Se les siembra la misma jornada.
-- Los días se apagan con `activo`, no se borran: quien tenga la fila cerrada a
-- propósito conserva sus filas y este UPDATE no lo alcanza. Solo entra el que
-- nunca abrió la pantalla de horario.
with en_blanco as (
  select p.id from turno_perfiles p
   where p.aprobado and p.activo
     and not exists (select 1 from turno_horarios h where h.perfil_id = p.id)
), sembrados as (
  insert into turno_horarios (perfil_id, dia_semana, hora_inicio, hora_fin, activo, tiempo_entre_clientes)
  select b.id, d, time '09:00', time '18:00', true, 0
    from en_blanco b, generate_series(1, 6) d
  returning perfil_id
)
update turno_perfiles set jornada_sembrada = true
 where id in (select distinct perfil_id from sembrados);
