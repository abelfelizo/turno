-- EL QUE NO LLEGA PIERDE EL TURNO, Y NO ANTES
--
-- Salvedad del piloto: "si el walk-in está en el local, y el que sigue en la
-- fila no está, ni el que va detrás, el barbero podría meter al walk-in en el
-- turno de quien está ahí. El walk-in rompe la regla solo si quien le toca no
-- llega."
--
-- Es correcto, y no contradice la migración 58: el orden se respeta, lo que pasa
-- es que un turno se pierde por no presentarse. La silla vacía con gente delante
-- es dinero tirado, y el cliente que sí está esperando no tiene por qué pagar la
-- ausencia de otro.
--
-- LO QUE YA HABÍA, Y POR QUÉ NO BASTABA. El motor ya expira a quien no llega:
-- turno_llamar_siguiente pone `expira_at` y el barrido de cada minuto lo marca
-- 'expirado'. Pero eso son diez minutos de silla parada POR CADA AUSENTE, y con
-- dos ausentes seguidos son veinte. El barbero está mirando el local: ve en un
-- segundo lo que el reloj tarda diez en confirmar.
--
-- LA CONDICIÓN QUE LO SEPARA DE ADELANTAR A DEDO. Para declarar a alguien
-- ausente hay que HABERLO LLAMADO ANTES. No se puede saltar a quien nunca tuvo
-- su oportunidad:
--
--   · el turno tiene que estar en 'llamado' o 'en_camino' — o sea, ya se le
--     avisó y no se ha sentado;
--   · y tiene que ser el PRIMERO del orden, para que no se pueda usar como una
--     puerta trasera para colar a alguien por delante de otros que sí están.
--
-- Con eso, "el walk-in rompe la regla" deja de ser una decisión del barbero y
-- pasa a ser una consecuencia: llamaste, no vino, perdió el turno, sigue el
-- siguiente. Y queda registrado como 'expirado', igual que si lo hubiera hecho
-- el reloj, así que el historial no distingue entre un plantón y otro.

create or replace function turno_no_esta(p_cola uuid)
returns turno_cola
language plpgsql security definer set search_path to 'public' as $$
declare v public.turno_cola; v_primero uuid;
begin
  v := public.turno_cola_operable(p_cola);

  -- Se le tuvo que llamar antes: sin esto sería "adelantar" con otro nombre.
  if v.estado not in ('llamado', 'en_camino') then
    raise exception 'primero llámalo: solo se marca ausente a quien ya tuvo su turno';
  end if;

  -- Y tiene que ser el que le toca. Si no, esto se convierte en la puerta
  -- trasera que la migración 58 cerró por la puerta principal.
  select q.id into v_primero
    from turno_cola q
   where q.negocio_id = v.negocio_id
     and q.estado in ('en_fila', 'llamado', 'en_camino')
     and (v.perfil_id is null or q.perfil_id is null or q.perfil_id = v.perfil_id)
   order by q.prioridad asc, q.posicion asc
   limit 1;

  if v_primero is distinct from p_cola then
    raise exception 'ese no es el turno que toca ahora';
  end if;

  update turno_cola
     set estado = 'expirado', expira_at = now()
   where id = p_cola
   returning * into v;
  return v;
end $$;

grant execute on function turno_no_esta(uuid) to authenticated;
