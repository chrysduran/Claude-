-- Pulso Obra · esquema de la nube (Supabase).
-- Se aplica una sola vez: Supabase > SQL Editor > New query > pegar todo > Run.
-- Cada empresa ve solo sus datos (seguridad por filas). Los usuarios se unen a una empresa con un código de invitación.

-- ---------- Empresas y usuarios ----------
create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) between 1 and 120),
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
  nombre text not null check (length(nombre) between 1 and 200),
  meta numeric not null default 85 check (meta between 1 and 100),
  contratistas jsonb not null default '[]' check (jsonb_typeof(contratistas) = 'array' and pg_column_size(contratistas) < 20000),
  zonas jsonb not null default '[]' check (jsonb_typeof(zonas) = 'array' and pg_column_size(zonas) < 20000),
  causas jsonb not null default '[]' check (jsonb_typeof(causas) = 'array' and pg_column_size(causas) < 20000),
  creado bigint not null default 0
);

create table public.conteos (
  id text primary key,
  proyecto_id text not null references public.proyectos on delete cascade,
  fecha text not null,
  contratista text not null,
  planeadas int not null check (planeadas between 0 and 999),
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

-- Límites de tamaño: nadie puede llenar la base con textos enormes ni con ids o fechas mal formados.
do $$
declare t text; c text;
begin
  foreach t in array array['proyectos', 'conteos', 'incumplimientos', 'restricciones', 'plan_actividades', 'narracion'] loop
    execute format('alter table public.%I add constraint id_valido check (length(id) between 1 and 200)', t);
    for c in select column_name from information_schema.columns
      where table_schema = 'public' and table_name = t and data_type = 'text' and column_name not in ('id', 'proyecto_id', 'nombre') loop
      execute format('alter table public.%I add constraint %I check (length(%I) <= %s)', t, c || '_largo', c,
        case when c in ('notas', 'detalle', 'observaciones') then 4000 when c like 'fecha%' or c = 'semana' then 10 else 500 end);
    end loop;
  end loop;
end $$;
alter table public.conteos add constraint fecha_valida check (fecha ~ '^\d{4}-\d{2}-\d{2}$');
alter table public.incumplimientos add constraint fecha_valida check (fecha ~ '^\d{4}-\d{2}-\d{2}$');

-- ---------- Bitácora de cambios: quién cambió qué y cuándo (la escribe la base, nadie puede alterarla) ----------
create table public.bitacora (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas on delete cascade,
  proyecto_id text,
  tabla text not null,
  fila_id text not null,
  operacion text not null check (operacion in ('alta', 'cambio', 'baja')),
  usuario_id uuid,
  email text not null default '',
  resumen text not null default '',
  cuando timestamptz not null default now()
);
create index on public.bitacora (empresa_id, cuando desc);

-- Intentos fallidos de usar un código de invitación (freno contra adivinar códigos).
create table public.intentos_codigo (
  usuario_id uuid not null,
  cuando timestamptz not null default now()
);
create index on public.intentos_codigo (usuario_id, cuando);

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
  -- 8 caracteres de un alfabeto de 31 sin letras ni números que se confunden (0/O, 1/I/L): ~850 mil millones de combinaciones.
  select string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + get_byte(uuid_send(gen_random_uuid()), n) % 31, 1), '') into v from generate_series(0, 7) n;
  insert into invitaciones (codigo, empresa_id, rol, creado_por) values (v, p_empresa, p_rol, auth.uid());
  return v;
end $$;

-- Unirse a una empresa con un código. Devuelve null si el código no sirve (el intento fallido queda anotado).
-- Tras 8 intentos fallidos en una hora, la cuenta espera antes de volver a probar.
create function public.unirse(p_codigo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare i invitaciones;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para usar el código'; end if;
  if (select count(*) from intentos_codigo where usuario_id = auth.uid() and cuando > now() - interval '1 hour') >= 8 then
    raise exception 'Demasiados intentos. Espera una hora y pide un código nuevo.';
  end if;
  select * into i from invitaciones where codigo = upper(trim(p_codigo)) for update;
  if not found or i.usada is not null or i.expira < now() then
    insert into intentos_codigo (usuario_id) values (auth.uid());
    return null;
  end if;
  insert into miembros (empresa_id, usuario_id, email, rol)
    values (i.empresa_id, auth.uid(), coalesce(auth.jwt() ->> 'email', ''), i.rol)
    on conflict (empresa_id, usuario_id) do nothing; -- quien ya es miembro conserva su rol
  update invitaciones set usada = now(), usada_por = auth.uid() where codigo = i.codigo;
  return i.empresa_id;
end $$;

-- Una empresa nunca se queda sin administrador.
create function public.cuidar_admin() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.rol = 'admin' and (tg_op = 'DELETE' or new.rol <> 'admin')
     and exists (select 1 from empresas where id = old.empresa_id) -- si se está borrando la empresa completa, se permite
     and not exists (select 1 from miembros where empresa_id = old.empresa_id and rol = 'admin' and usuario_id <> old.usuario_id) then
    raise exception 'La empresa necesita al menos un administrador. Nombra a otro antes.';
  end if;
  return coalesce(new, old);
end $$;
create trigger cuidar_admin before update or delete on public.miembros for each row execute function public.cuidar_admin();

-- Anota cada alta, cambio y baja en la bitácora.
create function public.anotar() returns trigger language plpgsql security definer set search_path = public as $$
declare f jsonb := to_jsonb(coalesce(new, old)); e uuid; p text;
begin
  if tg_table_name = 'proyectos' then e := (f ->> 'empresa_id')::uuid; p := f ->> 'id';
  else p := f ->> 'proyecto_id'; select empresa_id into e from proyectos where id = p; end if;
  if e is null or not exists (select 1 from empresas where id = e) then return null; end if; -- borrado en cascada de proyecto o empresa
  insert into bitacora (empresa_id, proyecto_id, tabla, fila_id, operacion, usuario_id, email, resumen)
  values (e, p, tg_table_name, f ->> 'id',
    case tg_op when 'INSERT' then 'alta' when 'UPDATE' then 'cambio' else 'baja' end,
    auth.uid(), coalesce(auth.jwt() ->> 'email', ''),
    left(coalesce(f ->> 'actividad', f ->> 'asunto', f ->> 'nombre', f ->> 'contratista', ''), 120));
  return null;
end $$;
do $$
declare t text;
begin
  foreach t in array array['proyectos', 'conteos', 'incumplimientos', 'restricciones', 'plan_actividades', 'narracion'] loop
    execute format('create trigger anotar after insert or update or delete on public.%I for each row execute function public.anotar()', t);
  end loop;
end $$;

-- Las funciones solo las usan usuarios con sesión; las de los disparadores, nadie directamente.
revoke execute on function public.es_miembro(uuid, text[]), public.empresa_de(text), public.cuidar_admin(), public.anotar() from public, anon;
grant execute on function public.es_miembro(uuid, text[]), public.empresa_de(text) to authenticated;
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
alter table public.bitacora enable row level security;
alter table public.intentos_codigo enable row level security; -- sin reglas: solo la función unirse la toca

create policy ver on public.empresas for select to authenticated using (es_miembro(id));
create policy borrar on public.empresas for delete to authenticated using (es_miembro(id, array['admin']));
create policy renombrar on public.empresas for update to authenticated using (es_miembro(id, array['admin'])) with check (es_miembro(id, array['admin']));

create policy ver on public.miembros for select to authenticated using (es_miembro(empresa_id));
create policy cambiar_rol on public.miembros for update to authenticated using (es_miembro(empresa_id, array['admin'])) with check (es_miembro(empresa_id, array['admin']));
-- Un administrador solo puede cambiar el rol: ni el correo ni a qué empresa o usuario pertenece la fila.
revoke update on public.miembros from authenticated, anon;
grant update (rol) on public.miembros to authenticated;
create policy quitar on public.miembros for delete to authenticated using (es_miembro(empresa_id, array['admin']) or usuario_id = auth.uid());

create policy ver on public.invitaciones for select to authenticated using (es_miembro(empresa_id, array['admin']));
create policy borrar on public.invitaciones for delete to authenticated using (es_miembro(empresa_id, array['admin']));

-- La bitácora solo la leen los administradores; nadie la escribe ni la borra desde la app.
create policy ver on public.bitacora for select to authenticated using (es_miembro(empresa_id, array['admin']));
revoke insert, update, delete on public.bitacora from authenticated, anon;

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
-- Privado, solo imágenes y máximo 5 MB por foto.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('fotos', 'fotos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

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
