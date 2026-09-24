-- Vuelta atrás de la 120. Solo quita la función que la 120 añadió; nada más
-- dependía de ella en la base. La app, sin ella, cae a turno_clientes_del_local
-- (ver lib/db.ts · getClientesDelLocalAdmin).
drop function if exists public.turno_clientes_del_local_admin(uuid);
