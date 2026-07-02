-- =====================================================================
-- TURNO · Migración 23: fix del sufijo numérico de los códigos
-- lpad(n,2,'0') TRUNCA cuando n>=100 ('100'→'10'), lo que causaría códigos
-- duplicados y bucle infinito al pasar de 99 en un mismo prefijo.
-- Sufijo correcto: mínimo 2 dígitos, pero crece sin límite (01..99,100,1000…).
-- =====================================================================

create or replace function public.turno_gen_codigo(p_nombre text)
returns text language plpgsql security definer set search_path = public as $$
declare v_prefix text := public.turno_codigo_prefijo(p_nombre); v_code text; v_n int := 1;
begin
  loop
    v_code := v_prefix || (case when v_n < 10 then '0' else '' end) || v_n::text;
    exit when not exists(select 1 from turno_negocios where codigo_acceso = v_code);
    v_n := v_n + 1;
  end loop;
  return v_code;
end $$;

create or replace function public.turno_gen_codigo_barbero(p_nombre text)
returns text language plpgsql security definer set search_path = public as $$
declare v_prefix text := public.turno_codigo_prefijo(p_nombre); v_code text; v_n int := 1;
begin
  loop
    v_code := v_prefix || (case when v_n < 10 then '0' else '' end) || v_n::text;
    exit when not exists(select 1 from turno_usuarios where codigo_barbero = v_code);
    v_n := v_n + 1;
  end loop;
  return v_code;
end $$;
