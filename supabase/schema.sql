-- Pulso Obra · esquema de la nube (Supabase).
-- Se aplica una sola vez: Supabase > SQL Editor > New query > pegar todo > Run.
-- Cada empresa ve solo sus datos (seguridad por filas). Los usuarios se unen a una empresa con un código de invitación.

-- ---------- Empresas y usuarios ----------
create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  creado timestamptz not null default now()
);

create table public.miembros (
  empresa_id uuid not null references public.empresas on delete cascade,
  usuario_id uuid not null references auth.users on delete cascade,
  email text not null default '',
  rol text not null check (rol in ('admin', 'supervisor', 'lectura')),
  creado timestamptz not null default now(),
  primary key (empresa_id, usuario_id)
);

create table public.invitaciones (
  codigo text primary key,
  empresa_id uuid not null references public.empresas on delete cascade,
  rol text not null check (rol in ('admin', 'supervisor', 'lectura')),
  creado_por uuid references auth.users on delete set null,
  expira timestamptz not null default now() + interval '7 days',
  usada_por uuid references auth.users on delete set null,
  usada timestamptz
);

-- ---------- Datos de obra (los ids los genera la app, por eso son texto) ----------
create table public.proyectos (
  id text primary key,
  empresa_id uuid not null references public.empresas on delete cascade,
  nombre text not null,
  meta numeric not null default 85,
  contratistas jsonb not null default '[]',
  zonas jsonb not null default '[]',
  causas jsonb not null default '[]',
  creado bigint not null default 0
);

create table public.conteos (
  id text primary key,
  proyecto_id text not null references public.proyectos on delete cascade,
  fecha text not null,
  contratista text not null,
  planeadas int not null check (planeadas >= 0),
  actualizado bigint not null default 0
);

create table public.incumplimientos (
  id text primary key,
  proyecto_id text not null references public.proyectos on delete cascade,
  fecha text not null,
  contratista text not null,
  actividad text not null,
  zona text not null default '',
  causa text not null,
  notas text not null default '',
  contramedida text not null default '',
  responsable text not null default '',
  fecha_compromiso text not null default '',
  foto_id text not null default '',
  creado bigint not null default 0,
  actualizado bigint not null default 0
);

create table public.restricciones (
  id text primary key,
  proyecto_id text not null references public.proyectos on delete cascade,
  numero int not null,
  asunto text not null,
  detalle text not null default '',
  zona text not null default '',
  contratista text not null default '',
  responsable text not null default '',
  fecha_identificada text not null default '',
  fecha_compromiso text not null default '',
  fecha_cierre text not null default '',
  estado text not null default 'Abierta' check (estado in ('Abierta', 'En proceso', 'Liberada')),
  observaciones text not null default '',
  actualizado bigint not null default 0
);

create table public.plan_actividades (
  id text primary key,
  proyecto_id text not null references public.proyectos on delete cascade,
  semana text not null,
  grupo text not null default '',
  unidad text not null default '',
  actividad text not null,
  especialidad text not null default '',
  retrasada boolean not null default false,
  decision text check (decision in ('si', 'no')),
  motivo text not null default '',
  actualizado bigint not null default 0
);

create table public.narracion (
  id text primary key,
  proyecto_id text not null references public.proyectos on delete cascade,
  semana text not null,
  contratista text not null,
  notas text not null default '',
  actualizado bigint not null default 0
);

create index on public.miembros (usuario_id);
create index on public.proyectos (empresa_id);
create index on public.conteos (proyecto_id);
create index on public.incumplimientos (proyecto_id);
create index on public.restricciones (proyecto_id);
create index on public.plan_actividades (proyecto_id, semana);
create index on public.narracion (proyecto_id);

-- ---------- Funciones de apoyo para las reglas ----------
create function public.es_miembro(p_empresa uuid, roles text[] default array['admin', 'supervisor', 'lectura'])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from miembros where empresa_id = p_empresa and usuario_id = auth.uid() and rol = any (roles));
$$;

create function public.empresa_de(p_proyecto text)
returns uuid language sql stable security definer set search_path = public as $$
  select empresa_id from proyectos where id = p_proyecto;
$$;

-- Crear una empresa: quien la crea queda como administrador.
create function public.crear_empresa(p_nombre text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para crear una empresa'; end if;
  insert into empresas (nombre) values (trim(p_nombre)) returning id into v;
  insert into miembros (empresa_id, usuario_id, email, rol) values (v, auth.uid(), coalesce(auth.jwt() ->> 'email', ''), 'admin');
  return v;
end $$;

-- Generar un código de invitación (solo administradores). Vale 7 días y un solo uso.
create function public.crear_invitacion(p_empresa uuid, p_rol text)
returns text language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if not es_miembro(p_empresa, array['admin']) then raise exception 'Solo un administrador puede invitar'; end if;
  if p_rol not in ('admin', 'supervisor', 'lectura') then raise exception 'Rol no válido'; end if;
  v := upper(substr(translate(replace(gen_random_uuid()::text, '-', ''), '01', ''), 1, 8));
  insert into invitaciones (codigo, empresa_id, rol, creado_por) values (v, p_empresa, p_rol, auth.uid());
  return v;
end $$;

-- Unirse a una empresa con un código.
create function public.unirse(p_codigo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare i invitaciones;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para usar el código'; end if;
  select * into i from invitaciones where codigo = upper(trim(p_codigo)) for update;
  if not found or i.usada is not null or i.expira < now() then raise exception 'El código no existe, ya se usó o venció'; end if;
  insert into miembros (empresa_id, usuario_id, email, rol)
    values (i.empresa_id, auth.uid(), coalesce(auth.jwt() ->> 'email', ''), i.rol)
    on conflict (empresa_id, usuario_id) do update set rol = excluded.rol;
  update invitaciones set usada = now(), usada_por = auth.uid() where codigo = i.codigo;
  return i.empresa_id;
end $$;

revoke execute on function public.crear_empresa(text), public.crear_invitacion(uuid, text), public.unirse(text) from public, anon;
grant execute on function public.crear_empresa(text), public.crear_invitacion(uuid, text), public.unirse(text) to authenticated;

-- ---------- Reglas de acceso ----------
alter table public.empresas enable row level security;
alter table public.miembros enable row level security;
alter table public.invitaciones enable row level security;
alter table public.proyectos enable row level security;
alter table public.conteos enable row level security;
alter table public.incumplimientos enable row level security;
alter table public.restricciones enable row level security;
alter table public.plan_actividades enable row level security;
alter table public.narracion enable row level security;

create policy ver on public.empresas for select to authenticated using (es_miembro(id));
create policy renombrar on public.empresas for update to authenticated using (es_miembro(id, array['admin'])) with check (es_miembro(id, array['admin']));

create policy ver on public.miembros for select to authenticated using (es_miembro(empresa_id));
create policy cambiar_rol on public.miembros for update to authenticated using (es_miembro(empresa_id, array['admin'])) with check (es_miembro(empresa_id, array['admin']));
create policy quitar on public.miembros for delete to authenticated using (es_miembro(empresa_id, array['admin']) or usuario_id = auth.uid());

create policy ver on public.invitaciones for select to authenticated using (es_miembro(empresa_id, array['admin']));
create policy borrar on public.invitaciones for delete to authenticated using (es_miembro(empresa_id, array['admin']));

create policy ver on public.proyectos for select to authenticated using (es_miembro(empresa_id));
create policy administrar on public.proyectos for all to authenticated
  using (es_miembro(empresa_id, array['admin'])) with check (es_miembro(empresa_id, array['admin']));

do $$
declare t text;
begin
  foreach t in array array['conteos', 'incumplimientos', 'restricciones', 'plan_actividades', 'narracion'] loop
    execute format('create policy ver on public.%I for select to authenticated using (es_miembro(empresa_de(proyecto_id)))', t);
    execute format('create policy capturar on public.%I for all to authenticated using (es_miembro(empresa_de(proyecto_id), array[''admin'', ''supervisor''])) with check (es_miembro(empresa_de(proyecto_id), array[''admin'', ''supervisor'']))', t);
  end loop;
end $$;

-- ---------- Fotos (Storage). Ruta: <empresa_id>/<foto_id>.jpg ----------
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', false) on conflict (id) do nothing;

create policy fotos_ver on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and es_miembro(((storage.foldername(name))[1])::uuid));
create policy fotos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and es_miembro(((storage.foldername(name))[1])::uuid, array['admin', 'supervisor']));
create policy fotos_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and es_miembro(((storage.foldername(name))[1])::uuid, array['admin', 'supervisor']));

-- ---------- Cambios en vivo entre teléfonos ----------
alter publication supabase_realtime add table public.proyectos, public.conteos, public.incumplimientos, public.restricciones, public.plan_actividades, public.narracion;
alter table public.proyectos replica identity full;
alter table public.conteos replica identity full;
alter table public.incumplimientos replica identity full;
alter table public.restricciones replica identity full;
alter table public.plan_actividades replica identity full;
alter table public.narracion replica identity full;
