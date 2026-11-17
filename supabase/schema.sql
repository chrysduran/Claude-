-- Bitácora LPS · esquema para la fase 2 (usuarios, empresas y datos compartidos en la nube).
-- Cada empresa (cliente) ve solo sus proyectos. Se aplica en Supabase: SQL Editor > New query > Run.

create table empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  creado timestamptz not null default now()
);

create table miembros (
  empresa_id uuid references empresas on delete cascade,
  usuario_id uuid references auth.users on delete cascade,
  rol text not null check (rol in ('admin', 'supervisor', 'lectura')),
  primary key (empresa_id, usuario_id)
);

create table proyectos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas on delete cascade,
  nombre text not null,
  meta numeric not null default 85,
  contratistas jsonb not null default '[]',
  zonas jsonb not null default '[]',
  causas jsonb not null default '[]',
  creado timestamptz not null default now()
);

create table conteos (
  proyecto_id uuid references proyectos on delete cascade,
  fecha date not null,
  contratista text not null,
  planeadas int not null check (planeadas >= 0),
  actualizado timestamptz not null default now(),
  actualizado_por uuid references auth.users,
  primary key (proyecto_id, fecha, contratista)
);

create table incumplimientos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos on delete cascade,
  fecha date not null,
  contratista text not null,
  actividad text not null,
  zona text not null,
  causa text not null,
  notas text not null default '',
  contramedida text not null default '',
  responsable text not null default '',
  fecha_compromiso date,
  foto_path text, -- archivo en Storage, bucket "fotos"
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  actualizado_por uuid references auth.users
);

create table restricciones (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos on delete cascade,
  numero int not null,
  asunto text not null,
  detalle text not null default '',
  zona text not null default '',
  contratista text not null default '',
  responsable text not null,
  fecha_identificada date not null default current_date,
  fecha_compromiso date,
  fecha_cierre date,
  estado text not null default 'Abierta' check (estado in ('Abierta', 'En proceso', 'Liberada')),
  observaciones text not null default '',
  actualizado timestamptz not null default now(),
  unique (proyecto_id, numero)
);

create table plan_actividades (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos on delete cascade,
  semana text not null, -- AAAA-Www
  grupo text not null default '',
  unidad text not null default '',
  actividad text not null,
  especialidad text not null default '',
  retrasada boolean not null default false,
  decision text check (decision in ('si', 'no')),
  motivo text not null default '',
  actualizado timestamptz not null default now()
);

create table narracion (
  proyecto_id uuid references proyectos on delete cascade,
  semana text not null,
  contratista text not null,
  notas text not null default '',
  actualizado timestamptz not null default now(),
  primary key (proyecto_id, semana, contratista)
);

-- Seguridad por filas: un usuario solo ve datos de las empresas donde es miembro.
create function es_miembro(p_empresa uuid, roles text[] default array['admin','supervisor','lectura'])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from miembros where empresa_id = p_empresa and usuario_id = auth.uid() and rol = any(roles));
$$;

create function empresa_de(p_proyecto uuid) returns uuid language sql stable security definer set search_path = public as $$
  select empresa_id from proyectos where id = p_proyecto;
$$;

alter table empresas enable row level security;
alter table miembros enable row level security;
alter table proyectos enable row level security;
alter table conteos enable row level security;
alter table incumplimientos enable row level security;
alter table restricciones enable row level security;
alter table plan_actividades enable row level security;
alter table narracion enable row level security;

create policy ver_empresa on empresas for select using (es_miembro(id));
create policy ver_miembros on miembros for select using (es_miembro(empresa_id));
create policy admin_miembros on miembros for all using (es_miembro(empresa_id, array['admin'])) with check (es_miembro(empresa_id, array['admin']));
create policy ver_proyectos on proyectos for select using (es_miembro(empresa_id));
create policy admin_proyectos on proyectos for all using (es_miembro(empresa_id, array['admin'])) with check (es_miembro(empresa_id, array['admin']));

do $$
declare t text;
begin
  foreach t in array array['conteos','incumplimientos','restricciones','plan_actividades','narracion'] loop
    execute format('create policy ver on %I for select using (es_miembro(empresa_de(proyecto_id)))', t);
    execute format('create policy escribir on %I for all using (es_miembro(empresa_de(proyecto_id), array[''admin'',''supervisor''])) with check (es_miembro(empresa_de(proyecto_id), array[''admin'',''supervisor'']))', t);
  end loop;
end $$;
