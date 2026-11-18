-- Fuentes vinculadas (hojas publicadas como CSV de las que el proyecto se actualiza solo).
-- Solo para bases creadas antes del 18 nov 2026: Supabase > SQL Editor > New query > pegar > Run.
-- Mientras no se aplique, la app sigue funcionando y guarda las direcciones solo en el teléfono de quien las configuró.
alter table public.proyectos add column if not exists fuentes jsonb not null default '{}'
  check (jsonb_typeof(fuentes) = 'object' and pg_column_size(fuentes) < 4000);
