-- TE TOCA, Y EL RELOJ CORRE
--
-- Del piloto: "un botón que llame al siguiente e inicie cuenta regresiva de
-- espera y dispare una notificación que diga Tu turno, la cual responde con un
-- voy en camino o estoy aquí, y el barbero puede darle a esperar o llamar
-- siguiente o atendiendo".
--
-- Media pieza ya existía y no se veía. turno_llamar_siguiente lleva desde
-- siempre poniendo `expira_at = now() + ventana_llegada_min`: la cuenta atrás
-- estaba EN LOS DATOS, pero ninguna pantalla la enseñaba. El barbero llamaba y
-- se quedaba sin saber cuánto le quedaba al otro, y el cliente veía "es tu
-- turno" sin ninguna urgencia. El reloj corría a oscuras para los dos.
--
-- Lo que faltaba de verdad son las dos respuestas del cliente y las dos salidas
-- del barbero:
--
--   · "VOY EN CAMINO" ya estaba (turno_confirmar_camino).
--   · "ESTOY AQUÍ" no. Y no es lo mismo: quien ya está en la puerta no puede
--     perder el turno por un reloj. Por eso, además de dejar constancia,
--     APAGA la cuenta atrás — el barrido de cada minuto expira por `expira_at`,
--     y a alguien que está de pie en el local no se le expira nada.
--
--   · "ESPERAR" le regala más tiempo a quien dijo que venía. Sin esto la única
--     alternativa a que expirara era marcarlo ausente, que es una decisión
--     mucho más gorda para "dale dos minutos que está aparcando".
--
-- Se guarda `llego_at` en vez de inventar un estado nuevo. Un estado más son
-- cuatro sitios que hay que enseñar a leerlo y una máquina de estados con una
-- rama más; una marca de tiempo contesta la única pregunta que importa —¿está
-- aquí y desde cuándo?— sin tocar nada de lo que ya funciona.

alter table turno_cola add column if not exists llego_at timestamptz;

comment on column turno_cola.llego_at is
  'Cuándo el cliente dijo "estoy aquí". No es un estado: el turno sigue en '
  'llamado/en_camino. Marca que la persona está en el local, y por eso al '
  'ponerse se apaga expira_at — a quien ya llegó no se le expira el turno.';

-- ── ESTOY AQUÍ ──────────────────────────────────────────────────────────────
create or replace function turno_ya_llegue(p_cola uuid)
returns turno_cola
language plpgsql security definer set search_path to 'public' as $$
declare v public.turno_cola;
begin
  select * into v from turno_cola where id = p_cola and cliente_id = public.turno_uid();
  if v.id is null then raise exception 'no autorizado'; end if;
  if v.estado not in ('en_fila', 'llamado', 'en_camino') then
    raise exception 'ese turno ya no está esperando';
  end if;

  -- expira_at a NULL: el reloj de la ventana de llegada existe para el que no
  -- aparece. Este apareció.
  update turno_cola
     set llego_at = coalesce(llego_at, now()),
         en_camino_at = coalesce(en_camino_at, now()),
         estado = case when estado = 'en_fila' then estado else 'en_camino' end,
         expira_at = null
   where id = p_cola
   returning * into v;
  return v;
end $$;

grant execute on function turno_ya_llegue(uuid) to authenticated;
revoke execute on function turno_ya_llegue(uuid) from public, anon;

-- ── DALE UN MINUTO MÁS ──────────────────────────────────────────────────────
-- Del barbero, no del cliente: es él quien decide si le espera.
create or replace function turno_dar_mas_tiempo(p_cola uuid, p_min int default 5)
returns turno_cola
language plpgsql security definer set search_path to 'public' as $$
declare v public.turno_cola;
begin
  v := public.turno_cola_operable(p_cola);

  if v.estado not in ('llamado', 'en_camino') then
    raise exception 'solo se le da más tiempo a quien ya fue llamado';
  end if;
  if p_min < 1 or p_min > 30 then
    raise exception 'entre 1 y 30 minutos';
  end if;

  -- Desde AHORA, no desde el expira anterior: si ya se había pasado, sumarle al
  -- pasado dejaría el turno expirado igualmente y el botón no haría nada
  -- visible, que es la peor forma de fallar.
  update turno_cola
     set expira_at = greatest(coalesce(expira_at, now()), now()) + make_interval(mins => p_min)
   where id = p_cola
   returning * into v;
  return v;
end $$;

grant execute on function turno_dar_mas_tiempo(uuid, int) to authenticated;
revoke execute on function turno_dar_mas_tiempo(uuid, int) from public, anon;
