-- =====================================================================
-- TURNO · Fase 0 · Migración 2: activar RLS + políticas (17 tablas turno_)
-- Modelo: anon SIN acceso. authenticated accede según pertenencia
-- (turno_membresias) y propiedad. dueno administra su negocio.
-- =====================================================================

-- Activar RLS
alter table public.turno_usuarios            enable row level security;
alter table public.turno_negocios            enable row level security;
alter table public.turno_configuracion_negocio enable row level security;
alter table public.turno_membresias          enable row level security;
alter table public.turno_perfiles            enable row level security;
alter table public.turno_servicios           enable row level security;
alter table public.turno_horarios            enable row level security;
alter table public.turno_bloqueos            enable row level security;
alter table public.turno_citas               enable row level security;
alter table public.turno_cola                enable row level security;
alter table public.turno_grupos              enable row level security;
alter table public.turno_preferencias_cliente enable row level security;
alter table public.turno_notas_privadas      enable row level security;
alter table public.turno_historial_visitas   enable row level security;
alter table public.turno_resenas             enable row level security;
alter table public.turno_puntos              enable row level security;
alter table public.turno_eventos_log         enable row level security;

-- ---------------------------------------------------------------- USUARIOS
create policy turno_usuarios_select on public.turno_usuarios for select to authenticated
  using ( id = public.turno_uid() or id in (select public.turno_usuarios_de_mis_negocios()) );
create policy turno_usuarios_insert on public.turno_usuarios for insert to authenticated
  with check ( auth_id = auth.uid() );
create policy turno_usuarios_update on public.turno_usuarios for update to authenticated
  using ( id = public.turno_uid() ) with check ( id = public.turno_uid() );

-- ---------------------------------------------------------------- NEGOCIOS
-- SELECT abierto a autenticados (necesario para buscar por codigo en onboarding)
create policy turno_negocios_select on public.turno_negocios for select to authenticated
  using ( true );
create policy turno_negocios_insert on public.turno_negocios for insert to authenticated
  with check ( true );
create policy turno_negocios_update on public.turno_negocios for update to authenticated
  using ( id in (select public.turno_negocios_admin()) )
  with check ( id in (select public.turno_negocios_admin()) );

-- -------------------------------------------------------- CONFIGURACION NEGOCIO
create policy turno_config_select on public.turno_configuracion_negocio for select to authenticated
  using ( negocio_id in (select public.turno_mis_negocios()) );
create policy turno_config_write on public.turno_configuracion_negocio for all to authenticated
  using ( negocio_id in (select public.turno_negocios_admin()) )
  with check ( negocio_id in (select public.turno_negocios_admin()) );

-- ---------------------------------------------------------------- MEMBRESIAS
create policy turno_membresias_select on public.turno_membresias for select to authenticated
  using ( usuario_id = public.turno_uid() or negocio_id in (select public.turno_mis_negocios()) );
-- alta: unirse a uno mismo, o el dueno agrega a otros
create policy turno_membresias_insert on public.turno_membresias for insert to authenticated
  with check ( usuario_id = public.turno_uid() or negocio_id in (select public.turno_negocios_admin()) );
create policy turno_membresias_update on public.turno_membresias for update to authenticated
  using ( negocio_id in (select public.turno_negocios_admin()) or usuario_id = public.turno_uid() )
  with check ( negocio_id in (select public.turno_negocios_admin()) or usuario_id = public.turno_uid() );

-- ---------------------------------------------------------------- PERFILES
create policy turno_perfiles_select on public.turno_perfiles for select to authenticated
  using ( negocio_id in (select public.turno_mis_negocios()) );
create policy turno_perfiles_insert on public.turno_perfiles for insert to authenticated
  with check ( usuario_id = public.turno_uid() );
create policy turno_perfiles_update on public.turno_perfiles for update to authenticated
  using ( usuario_id = public.turno_uid() or negocio_id in (select public.turno_negocios_admin()) )
  with check ( usuario_id = public.turno_uid() or negocio_id in (select public.turno_negocios_admin()) );

-- ---------------------------------------------------------------- SERVICIOS
create policy turno_servicios_select on public.turno_servicios for select to authenticated
  using ( public.turno_perfil_en_mis_negocios(perfil_id) );
create policy turno_servicios_write on public.turno_servicios for all to authenticated
  using ( public.turno_es_mi_perfil(perfil_id) )
  with check ( public.turno_es_mi_perfil(perfil_id) );

-- ---------------------------------------------------------------- HORARIOS
create policy turno_horarios_select on public.turno_horarios for select to authenticated
  using ( public.turno_perfil_en_mis_negocios(perfil_id) );
create policy turno_horarios_write on public.turno_horarios for all to authenticated
  using ( public.turno_es_mi_perfil(perfil_id) )
  with check ( public.turno_es_mi_perfil(perfil_id) );

-- ---------------------------------------------------------------- BLOQUEOS
create policy turno_bloqueos_select on public.turno_bloqueos for select to authenticated
  using ( public.turno_perfil_en_mis_negocios(perfil_id) );
create policy turno_bloqueos_write on public.turno_bloqueos for all to authenticated
  using ( public.turno_es_mi_perfil(perfil_id) )
  with check ( public.turno_es_mi_perfil(perfil_id) );

-- ---------------------------------------------------------------- CITAS
create policy turno_citas_select on public.turno_citas for select to authenticated
  using ( cliente_id = public.turno_uid() or negocio_id in (select public.turno_mis_negocios()) );
create policy turno_citas_insert on public.turno_citas for insert to authenticated
  with check ( cliente_id = public.turno_uid() or negocio_id in (select public.turno_mis_negocios()) );
create policy turno_citas_update on public.turno_citas for update to authenticated
  using ( cliente_id = public.turno_uid() or negocio_id in (select public.turno_mis_negocios()) )
  with check ( cliente_id = public.turno_uid() or negocio_id in (select public.turno_mis_negocios()) );

-- ---------------------------------------------------------------- COLA
create policy turno_cola_select on public.turno_cola for select to authenticated
  using ( cliente_id = public.turno_uid() or negocio_id in (select public.turno_mis_negocios()) );
create policy turno_cola_insert on public.turno_cola for insert to authenticated
  with check ( cliente_id = public.turno_uid() or negocio_id in (select public.turno_mis_negocios()) );
create policy turno_cola_update on public.turno_cola for update to authenticated
  using ( cliente_id = public.turno_uid() or negocio_id in (select public.turno_mis_negocios()) )
  with check ( cliente_id = public.turno_uid() or negocio_id in (select public.turno_mis_negocios()) );

-- ---------------------------------------------------------------- GRUPOS
create policy turno_grupos_select on public.turno_grupos for select to authenticated
  using ( lider_id = public.turno_uid() or negocio_id in (select public.turno_mis_negocios()) );
create policy turno_grupos_write on public.turno_grupos for all to authenticated
  using ( lider_id = public.turno_uid() or negocio_id in (select public.turno_mis_negocios()) )
  with check ( lider_id = public.turno_uid() or negocio_id in (select public.turno_mis_negocios()) );

-- ----------------------------------------------------- PREFERENCIAS CLIENTE
-- el cliente gestiona las suyas; el profesional del negocio puede leerlas
create policy turno_prefs_select on public.turno_preferencias_cliente for select to authenticated
  using ( usuario_id = public.turno_uid() or negocio_id in (select public.turno_mis_negocios()) );
create policy turno_prefs_write on public.turno_preferencias_cliente for all to authenticated
  using ( usuario_id = public.turno_uid() )
  with check ( usuario_id = public.turno_uid() );

-- ------------------------------------------------------- NOTAS PRIVADAS
-- privadas del profesional: el cliente NO las ve
create policy turno_notas_all on public.turno_notas_privadas for all to authenticated
  using ( public.turno_es_mi_perfil(perfil_id) )
  with check ( public.turno_es_mi_perfil(perfil_id) );

-- ---------------------------------------------------- HISTORIAL VISITAS
create policy turno_historial_select on public.turno_historial_visitas for select to authenticated
  using ( cliente_id = public.turno_uid() or negocio_id in (select public.turno_mis_negocios()) );
create policy turno_historial_insert on public.turno_historial_visitas for insert to authenticated
  with check ( negocio_id in (select public.turno_mis_negocios()) );

-- ---------------------------------------------------------------- RESENAS
create policy turno_resenas_select on public.turno_resenas for select to authenticated
  using ( cliente_id = public.turno_uid() or public.turno_perfil_en_mis_negocios(perfil_id) );
create policy turno_resenas_insert on public.turno_resenas for insert to authenticated
  with check ( cliente_id = public.turno_uid() );

-- ---------------------------------------------------------------- PUNTOS
create policy turno_puntos_select on public.turno_puntos for select to authenticated
  using ( usuario_id = public.turno_uid() or negocio_id in (select public.turno_mis_negocios()) );
create policy turno_puntos_write on public.turno_puntos for all to authenticated
  using ( negocio_id in (select public.turno_mis_negocios()) )
  with check ( negocio_id in (select public.turno_mis_negocios()) );

-- ---------------------------------------------------------------- EVENTOS LOG
create policy turno_eventos_select on public.turno_eventos_log for select to authenticated
  using ( negocio_id in (select public.turno_mis_negocios()) );
create policy turno_eventos_insert on public.turno_eventos_log for insert to authenticated
  with check ( negocio_id in (select public.turno_mis_negocios()) );
