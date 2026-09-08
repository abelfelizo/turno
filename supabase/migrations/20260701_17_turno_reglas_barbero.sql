-- =====================================================================
-- TURNO · Migración 17: reglas del barbero + endurecer Storage
-- 1) turno_perfiles.limite_cola: máximo de clientes en fila para ese
--    barbero (null/0 = sin límite). Se aplica en turno_entrar_a_cola.
-- 2) Acota la escritura del bucket turno-perfiles por carpeta/dueño.
-- =====================================================================

alter table public.turno_perfiles
  add column if not exists limite_cola int;

-- ── Entrar a la cola con límite por barbero ──────────────────────────
create or replace function public.turno_entrar_a_cola(
  p_negocio uuid, p_servicio uuid, p_tipo_cola text default 'digital', p_perfil uuid default null
) returns public.turno_cola
language plpgsql security definer set search_path = public as $$
declare
  v_cliente uuid := public.turno_uid();
  v_pos int;
  v_prioridad int;
  v_limite int;
  v_en_fila int;
  v_row public.turno_cola;
begin
  if v_cliente is null then raise exception 'no autenticado'; end if;
  if p_tipo_cola not in ('digital','fisica') then raise exception 'tipo_cola invalido'; end if;
  if not (p_negocio in (select public.turno_mis_negocios())) then
    raise exception 'sin acceso al negocio';
  end if;
  -- Caso 18: un solo turno activo por cliente
  if exists(select 1 from turno_cola
            where cliente_id = v_cliente and estado in ('en_fila','llamado','en_camino')) then
    raise exception 'ya tienes un turno activo';
  end if;
  -- serializar el cálculo de posición por negocio
  perform pg_advisory_xact_lock(hashtext('turno_cola_' || p_negocio::text));
  -- Límite de cola del barbero elegido (si aplica)
  if p_perfil is not null then
    select limite_cola into v_limite from turno_perfiles where id = p_perfil;
    if v_limite is not null and v_limite > 0 then
      select count(*) into v_en_fila from turno_cola
        where perfil_id = p_perfil and estado in ('en_fila','llamado','en_camino');
      if v_en_fila >= v_limite then
        raise exception 'fila llena: este barbero no acepta más turnos por ahora';
      end if;
    end if;
  end if;
  v_prioridad := case when p_tipo_cola = 'digital' then 2 else 3 end;
  select coalesce(max(posicion) + 1, 1) into v_pos
    from turno_cola where negocio_id = p_negocio and estado = 'en_fila';
  insert into turno_cola(negocio_id, perfil_id, cliente_id, servicio_id, tipo_cola, prioridad, posicion, estado)
  values (p_negocio, p_perfil, v_cliente, p_servicio, p_tipo_cola, v_prioridad, v_pos, 'en_fila')
  returning * into v_row;
  return v_row;
end $$;

grant execute on function public.turno_entrar_a_cola(uuid,uuid,text,uuid) to authenticated;
revoke execute on function public.turno_entrar_a_cola(uuid,uuid,text,uuid) from public, anon;

-- ── Storage: escritura acotada por carpeta y dueño ───────────────────
-- barberos/<perfil_id>/... solo el dueño del perfil.
-- logos/<negocio_id>/...   solo un admin de ese negocio.
drop policy if exists "turno_perfiles_bucket_insert" on storage.objects;
create policy "turno_perfiles_bucket_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'turno-perfiles' and (
      ((storage.foldername(name))[1] = 'barberos'
        and (storage.foldername(name))[2] in (select id::text from public.turno_perfiles where usuario_id = public.turno_uid()))
      or
      ((storage.foldername(name))[1] = 'logos'
        and (storage.foldername(name))[2] in (select public.turno_negocios_admin()::text))
    )
  );

drop policy if exists "turno_perfiles_bucket_update" on storage.objects;
create policy "turno_perfiles_bucket_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'turno-perfiles')
  with check (
    bucket_id = 'turno-perfiles' and (
      ((storage.foldername(name))[1] = 'barberos'
        and (storage.foldername(name))[2] in (select id::text from public.turno_perfiles where usuario_id = public.turno_uid()))
      or
      ((storage.foldername(name))[1] = 'logos'
        and (storage.foldername(name))[2] in (select public.turno_negocios_admin()::text))
    )
  );
