-- TRES DECISIONES DE PRODUCTO DEL PILOTO
--
-- ── A) LAS CITAS SON PRIORIDAD ──────────────────────────────────────────────
--
-- "Las citas son prioridad, si no las quiere debe cancelarlas."
--
-- En la migración 56 tomé la lectura estricta de "tal vez las de ese día" y el
-- descanso cortaba también las citas de lo que quedaba de hoy. Es la lectura
-- equivocada: una cita es un compromiso ya adquirido con alguien que reservó, y
-- un botón de descanso no puede deshacerlo en silencio. Si el barbero no piensa
-- atenderlas, tiene que cancelarlas — y así el cliente se entera, que es lo que
-- separa "me voy" de "dejé a alguien plantado".
--
-- El descanso queda entonces con un solo significado, mucho más limpio: NO
-- ENTRA GENTE NUEVA A MI FILA AHORA. Nada más. El inactivo sigue cerrando la
-- agenda entera, que para eso son dos estados.
--
--                    fila (ahora)   citas (hoy y futuras)
--   disponible            sí                sí
--   descanso              NO                sí
--   inactivo              NO                NO
--
-- Y si de verdad no va a estar, para eso están los bloqueos: dicen "esta hora
-- no existe" y además impiden que le pisen una cita (migración 51).
--
-- ── B) LOS CÓDIGOS DE LOS LOCALES SON PRIVADOS ──────────────────────────────
--
-- "Los códigos son privados, solo se accede a los que ingreses."
--
-- La política de lectura de turno_negocios era `using (true)`: cualquier
-- usuario registrado podía leer la tabla entera, códigos de acceso incluidos.
-- Con ese código cualquiera se une como cliente a un local que no le ha
-- invitado, y desde la migración 50 un profesional al menos queda pendiente de
-- aprobación, pero el código deja de ser un secreto igualmente.
--
-- Ahora solo ves los locales a los que perteneces. Para poder entrar la primera
-- vez —cuando por definición todavía no perteneces— se añade una función que
-- resuelve UN código concreto y devuelve solo lo justo para enseñar "te vas a
-- unir a Buen Corte": nombre y modalidad. Nunca el código de vuelta, ni la
-- dirección, ni el teléfono. Se puede preguntar por un código, no listar.

create or replace function turno_perfil_acepta(p_perfil uuid, p_fecha date default null)
returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare v_est text;
begin
  if p_perfil is null then return true; end if;   -- "el que esté libre": no es de nadie
  select coalesce(pr.estado_actual, 'disponible') into v_est
    from turno_perfiles pr
   where pr.id = p_perfil and pr.activo and pr.aprobado;

  -- Sin fila: perfil inexistente, dado de baja o todavía sin aprobar.
  if v_est is null then return false; end if;
  if v_est = 'inactivo' then return false; end if;

  -- El descanso solo cierra la fila de AHORA (p_fecha null). Una cita, sea de
  -- hoy o de la semana que viene, es un compromiso: se cancela a mano o se
  -- respeta.
  if v_est = 'descanso' then return p_fecha is not null; end if;
  return true;
end $$;

-- ── LOS LOCALES QUE VES SON LOS TUYOS ───────────────────────────────────────
drop policy if exists turno_negocios_select on turno_negocios;
create policy turno_negocios_select on turno_negocios
  for select
  using (id in (select public.turno_mis_negocios()));

-- La puerta de entrada: se pregunta por UN código, no se lista nada. Devuelve
-- lo mínimo para que la pantalla pueda decir a qué local te estás uniendo.
create or replace function turno_negocio_por_codigo(p_codigo text)
returns table(id uuid, nombre text, tipo text, moneda text)
language sql stable security definer set search_path to 'public' as $$
  select n.id, n.nombre, n.tipo, n.moneda
    from turno_negocios n
   where n.codigo_acceso = upper(btrim(p_codigo)) and n.activo
   limit 1
$$;

grant execute on function turno_perfil_acepta(uuid, date)   to authenticated;
grant execute on function turno_negocio_por_codigo(text)     to authenticated;
