-- 14_push_tokens: tokens de notificaciones push (Expo) por usuario.
create table if not exists public.turno_push_tokens (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.turno_usuarios(id) on delete cascade,
  token text not null unique,
  plataforma text,
  updated_at timestamptz not null default now()
);
create index if not exists turno_push_tokens_usuario_idx on public.turno_push_tokens(usuario_id);

alter table public.turno_push_tokens enable row level security;

drop policy if exists turno_push_tokens_own on public.turno_push_tokens;
create policy turno_push_tokens_own on public.turno_push_tokens
  for all
  using (usuario_id in (select id from public.turno_usuarios where auth_id = auth.uid()))
  with check (usuario_id in (select id from public.turno_usuarios where auth_id = auth.uid()));

-- Upsert del token del usuario autenticado (conflicto por token => reasigna dueño).
create or replace function public.turno_guardar_push_token(p_token text, p_plataforma text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid;
begin
  select id into v_uid from public.turno_usuarios where auth_id = auth.uid();
  if v_uid is null then raise exception 'usuario no encontrado'; end if;
  insert into public.turno_push_tokens(usuario_id, token, plataforma, updated_at)
  values (v_uid, p_token, p_plataforma, now())
  on conflict (token) do update
    set usuario_id = excluded.usuario_id,
        plataforma = excluded.plataforma,
        updated_at = now();
end;
$$;

revoke execute on function public.turno_guardar_push_token(text, text) from public, anon;
grant execute on function public.turno_guardar_push_token(text, text) to authenticated;
