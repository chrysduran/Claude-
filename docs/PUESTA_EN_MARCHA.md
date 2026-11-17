# Puesta en marcha de Pulso Obra

Pasos que requieren tus cuentas. Hazlos en este orden; cada uno toma pocos minutos.

## 1. Dirección de la app en Vercel (gratis)
1. Vercel → tu proyecto → **Settings → General → Project Name** → cámbialo a `pulsobra` → **Save**.
2. **Domains → Add Domain** → escribe `pulsobra.vercel.app` → entorno **Production** → **Save**.
3. Abre `https://pulsobra.vercel.app` en el celular e instálala:
   - iPhone (Safari): **Compartir → Agregar a pantalla de inicio**.
   - Android (Chrome): **⋮ → Instalar app**.

Hasta aquí la app funciona en **modo local**: los datos viven solo en cada teléfono.

## 2. Base de datos en la nube con Supabase (gratis para empezar)
1. Crea una cuenta en [supabase.com](https://supabase.com) con tu correo personal → **New project**.
   - Nombre: `pulso-obra`. Región: la más cercana (por ejemplo, *East US*). Guarda la contraseña de la base de datos en un lugar seguro.
2. **SQL Editor → New query** → pega todo el contenido de [`supabase/schema.sql`](../supabase/schema.sql) → **Run**. Debe terminar sin errores.
3. **Authentication → URL Configuration**:
   - *Site URL*: `https://pulsobra.vercel.app` (o tu dominio cuando lo tengas).
   - *Redirect URLs*: agrega la misma dirección.
4. **Authentication → Emails → Templates**: en **Magic Link** y en **Confirm signup**, cambia el asunto a `Tu código para entrar a Pulso Obra` y pega el contenido de [`supabase/plantillas/codigo-acceso.html`](../supabase/plantillas/codigo-acceso.html). Así el correo trae el código de 6 dígitos.
5. **Project Settings → API**: copia la *Project URL* y la llave *anon public*.

## 3. Conectar la app con Supabase
1. Vercel → tu proyecto → **Settings → Environment Variables**. Agrega, para *Production* y *Preview*:
   - `VITE_SUPABASE_URL` = la Project URL
   - `VITE_SUPABASE_ANON_KEY` = la llave anon public
2. **Deployments** → en el último, **⋯ → Redeploy**.
3. Abre la app: ahora pide tu correo. Entra, crea tu empresa y, en **Ajustes → Invitar**, genera códigos para tu equipo.
4. Si ya habías capturado en modo local en ese teléfono, en **Ajustes** aparece **Copiar mis proyectos a la empresa**.

> La llave *anon public* puede estar en la app: las reglas de la base de datos (ver `schema.sql`) son las que protegen los datos. **Nunca** pongas la llave *service_role* en Vercel ni en la app.

## 4. Correo de acceso (antes de tener muchos usuarios)
Supabase envía pocos correos por hora con su servidor de prueba. Cuando tu equipo crezca, en **Authentication → Emails → SMTP Settings** conecta un servicio de correo (por ejemplo Resend o Brevo; ambos tienen plan gratis) con un remitente de tu dominio.

## 5. Dominio propio (cuando lo compres)
1. Compra `pulsobra.app` (y opcionalmente `pulsobra.com`) **a tu nombre**. Lo más simple es comprarlo dentro de Vercel: **Domains → Buy**.
2. Vercel → **Domains → Add Domain** → `pulsobra.app` → Production. Si lo compraste fuera de Vercel, copia en tu proveedor los registros DNS que Vercel te muestra.
3. Actualiza en Supabase el *Site URL* y los *Redirect URLs* con el dominio nuevo.
4. En modo local los datos van ligados a la dirección: antes de cambiar, descarga un respaldo en **Ajustes**. En modo nube no hace falta: entras con tu correo y ahí están.

## Verificar las reglas de seguridad (opcional, para desarrolladores)
Con Docker instalado:
```bash
npx supabase start
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/schema.sql
SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:reglas
```
Comprueba que cada empresa solo ve lo suyo, los roles, las invitaciones, las fotos y los cambios en vivo.
