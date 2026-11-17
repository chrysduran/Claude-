# Pulso Obra

*El pulso diario de tu obra.* Dominio previsto: pulsobra.app

App web instalable (PWA) para llevar el **Last Planner System** desde el celular:

- **Captura:** actividades planeadas por contratista y por día, e incumplimientos con causa, contramedida, responsable, fecha de compromiso y foto.
- **PPC al instante:** del día, de la semana y por contratista, con semáforo contra la meta del proyecto.
- **Planear:** junta de planeación de la semana siguiente. Se importa la lista del programa maestro (CSV) o se agregan actividades a mano, y cada una se marca ✓ se planea / ✗ no se planea con su motivo.
- **Restricciones:** log con estado, responsable, compromiso, vencimientos y latencia.
- **Semana:** PPC diario, PPC por contratista, causas, seguimiento por contratista y descarga en Excel.
- **Análisis:** tendencia de PPC, causas que se repiten varias semanas y matriz causa × contratista.
- **Ajustes:** varios proyectos, catálogos configurables (contratistas, zonas, causas), meta de PPC, proyecto demo y respaldo.

## Modos de uso
- **Local (sin cuentas):** los datos se guardan en el teléfono (localStorage y, para las fotos, IndexedDB). Para pasar datos a otro teléfono se usa el respaldo en Ajustes.
- **Nube (con Supabase):** inicio de sesión con código por correo, empresas, equipo con roles (administrador, supervisor, solo lectura), invitaciones con código, datos compartidos con cambios en vivo, fotos en la nube y cola sin conexión. Se activa al publicar con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (ver `.env.example`).

Las decisiones de diseño y arquitectura están en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md). La guía para dejarla funcionando con tus cuentas está en [`docs/PUESTA_EN_MARCHA.md`](docs/PUESTA_EN_MARCHA.md). El esquema y las reglas de seguridad están en [`supabase/schema.sql`](supabase/schema.sql), con pruebas en `supabase/prueba-reglas.mjs`.

## Desarrollo
```bash
npm install
npm run dev      # servidor local
npm test         # pruebas
npm run build    # versión de producción en dist/
```

## Importar la planeación (CSV)
Primera fila con encabezados. Se reconocen estas columnas, sin importar mayúsculas ni acentos:

| Columna | También acepta | Obligatoria |
|---|---|---|
| actividad | tarea, vagon | Sí |
| grupo | nivel, frente, area | No |
| unidad | depto, departamento, zona | No |
| especialidad | contratista, disciplina | No |
| retrasada | (sí/x/1) | No |

## Publicar
Cualquier hosting de sitios estáticos sirve. En Vercel: importar el repositorio, framework **Vite**, comando `npm run build`, carpeta `dist`.

---
© chrysduran. Todos los derechos reservados.
