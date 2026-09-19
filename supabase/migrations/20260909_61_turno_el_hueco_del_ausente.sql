-- EL HUECO DEL QUE NO LLEGÓ LO OCUPA QUIEN ESTÁ, Y NADIE MÁS PIERDE NADA
--
-- Escrita, retirada y vuelta a escribir en la misma sesión. Merece la pena
-- contar por qué, porque el error de en medio es instructivo.
--
-- EL CASO. Fila: Juan (1º), Pedro (2º), un walk-in esperando. Juan no aparece.
-- Pedro tiene su turno estimado dentro de 40 minutos y todavía no ha llegado —
-- no porque falte, sino porque aún no le toca.
--
-- LO QUE HABÍA ANTES (migración 60). El barbero solo podía marcar ausentes en
-- cadena: Juan no está, Pedro tampoco, y entonces entra el walk-in. Pero eso
-- exige MARCAR A PEDRO COMO AUSENTE, y Pedro no ha faltado a nada: se le dijo
-- que viniera en 40 minutos. Penalizarlo por que la fila corrió más rápido de lo
-- prometido es cobrarle a él un problema que no creó. Como lo dijo el piloto:
-- "si le adelantas a última hora es probable que no esté".
--
-- LO QUE HACE FALTA. Que el hueco de Juan lo ocupe alguien que SÍ está en el
-- local, sin tocar a Pedro. El walk-in hereda el sitio exacto de Juan; Pedro
-- conserva su posición y su turno llega cuando le toca. Nadie pierde nada:
--
--   antes:  Juan(pos 1)  Pedro(pos 2)  Walkin(pos 3)
--   Juan no llega, Pedro aún no toca
--   después: Walkin(pos 1)  Pedro(pos 2)      <- Pedro intacto
--
-- POR QUÉ LA RETIRÉ Y POR QUÉ VUELVE. Entendí "si Pedro está presente se
-- atiende" como una condición que el SISTEMA debía imponer —impedir la
-- sustitución mientras Pedro estuviera esperando— y con esa lectura la función
-- parecía un adelantamiento encubierto. No lo era: era la descripción de lo
-- obvio. Si Pedro está delante del barbero, el barbero lo llama y ya; no hace
-- falta ninguna función para eso. La sustitución existe para el otro caso, el
-- que la 60 no sabía resolver sin castigar a un inocente.
--
-- LO QUE LA ATA PARA QUE NO SEA ADELANTAR A DEDO:
--   · a Juan hay que haberlo LLAMADO y ser el turno que toca;
--   · el sustituto solo puede venir de la fila FÍSICA — la que el barbero crea
--     con la persona delante, así que por construcción está en el local;
--   · uno por uno: consume una ausencia y un walk-in;
--   · y nadie por detrás cambia de sitio. Eso es lo que la separa de un
--     adelantamiento: no hay perjudicado.

create or replace function turno_sustituir_ausente(p_ausente uuid, p_sustituto uuid)
returns turno_cola
language plpgsql security definer set search_path to 'public' as $$
declare v_aus public.turno_cola; v_sus public.turno_cola; v_primero uuid;
begin
  v_aus := public.turno_cola_operable(p_ausente);
  v_sus := public.turno_cola_operable(p_sustituto);

  if v_aus.id = v_sus.id then raise exception 'no puede sustituirse a sí mismo'; end if;
  if v_aus.negocio_id <> v_sus.negocio_id then raise exception 'son de locales distintos'; end if;

  if v_aus.estado not in ('llamado', 'en_camino') then
    raise exception 'primero llámalo: solo se sustituye a quien ya tuvo su turno';
  end if;

  select q.id into v_primero
    from turno_cola q
   where q.negocio_id = v_aus.negocio_id
     and q.estado in ('en_fila', 'llamado', 'en_camino')
     and (v_aus.perfil_id is null or q.perfil_id is null or q.perfil_id = v_aus.perfil_id)
   order by q.prioridad asc, q.posicion asc
   limit 1;
  if v_primero is distinct from p_ausente then
    raise exception 'ese no es el turno que toca ahora';
  end if;

  -- Solo entra quien está de verdad en el local. La fila física la crea el
  -- barbero con la persona delante; un turno pedido desde el teléfono no prueba
  -- nada sobre dónde está quien lo pidió, que es justo lo que aquí importa.
  if v_sus.tipo_cola <> 'fisica' then
    raise exception 'solo puede sustituir alguien que esté en el local';
  end if;
  if v_sus.estado <> 'en_fila' then
    raise exception 'ese turno ya no está esperando';
  end if;

  update turno_cola set estado = 'expirado', expira_at = now() where id = p_ausente;

  -- Hereda el sitio exacto: la pareja entera (prioridad, posicion), que es lo
  -- que define el orden. Heredar solo la posición lo dejaría detrás igualmente,
  -- porque la prioridad se mira primero.
  update turno_cola
     set prioridad = v_aus.prioridad,
         posicion  = v_aus.posicion,
         perfil_id = coalesce(v_sus.perfil_id, v_aus.perfil_id)
   where id = p_sustituto
   returning * into v_sus;

  return v_sus;
end $$;

grant execute on function turno_sustituir_ausente(uuid, uuid) to authenticated;
