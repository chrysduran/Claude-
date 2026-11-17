# Arquitectura de Pulso Obra

Registro de decisiones (ADR). Cada una explica el contexto, la opción elegida, las alternativas y lo que habrá que revisar.

## Vista general
```
Teléfono (PWA instalable)
 ├─ React + estado local (localStorage / IndexedDB para fotos)  ← funciona sin señal
 ├─ Cola de cambios pendientes → envío con reintentos
 └─ Suscripción en vivo (Realtime)
        │
Supabase (Postgres + Auth + Storage + Realtime)
 ├─ Reglas por fila: cada empresa ve solo lo suyo
 ├─ Roles: administrador · supervisor · solo lectura
 └─ Funciones: crear_empresa, crear_invitacion, unirse
Vercel: hospedaje estático + encabezados de seguridad
```

---

## ADR-001 · App web instalable (PWA) en lugar de app nativa
**Estado:** aceptada · **Fecha:** 17 nov 2026

**Contexto.** Una persona construye y mantiene el producto. Los usuarios están en obra, con celulares iPhone y Android variados.

| Opción | Complejidad | Costo | Distribución | Funciones del teléfono |
|---|---|---|---|---|
| **PWA (elegida)** | Baja | Hosting gratis | Un link | Cámara, sin conexión, instalación |
| Nativa iOS + Android | Alta (2 bases de código) | Cuentas de desarrollador + revisión de tiendas | Tiendas | Todas |
| React Native / Expo | Media | Cuentas de tiendas | Tiendas | Casi todas |

**Consecuencias.** Se publica sin revisión de tiendas y se actualiza al instante. Las notificaciones push en iPhone requieren que la app esté instalada (iOS 16.4+). Revisar si un cliente exige estar en App Store; empaquetarla con Capacitor sería el siguiente paso, sin reescribir.

## ADR-002 · Primero local, sincronización después ("local-first")
**Estado:** aceptada

**Contexto.** En obra la señal es irregular (sótanos, niveles altos). Perder una captura destruye la confianza en la herramienta.

**Decisión.** Toda escritura se guarda primero en el teléfono y se encola. La cola se envía en orden seguro (proyectos antes que sus registros; borrados al final), se compacta (solo la última versión de cada fila) y se reintenta al volver la conexión. Los errores de permiso se descartan con aviso; los de conexión se reintentan.

**Conflictos.** Última escritura gana, comparando `actualizado`. Un cambio en vivo más viejo que la copia local se ignora, y un cambio local pendiente tiene prioridad.

**Revisar.** Si varias personas editan el mismo registro al mismo tiempo con frecuencia, pasar a marcas de tiempo del servidor o a fusión por campo.

## ADR-003 · Supabase como backend
**Estado:** aceptada

| Opción | Datos relacionales | Seguridad multiempresa | Tiempo real | Dependencia |
|---|---|---|---|---|
| **Supabase (elegida)** | Postgres | Reglas por fila en la base | Sí | Baja: es Postgres estándar, se puede migrar |
| Firebase | Documentos | Reglas propias | Sí | Alta |
| Backend propio | Libre | Por programar | Por programar | Ninguna, pero mucho mantenimiento |

**Consecuencias.** La seguridad vive en la base de datos (`supabase/schema.sql`) y está probada con `npm run test:reglas`. La llave pública puede estar en la app; la llave de servicio nunca.

## ADR-004 · Sistema de diseño inspirado en iOS
**Estado:** aceptada

**Decisión.** Tipografía del sistema (SF en Apple, Roboto en Android), barra de pestañas inferior al alcance del pulgar, títulos grandes, listas agrupadas, barras translúcidas, hojas modales con Cancelar / Guardar, control segmentado, anillo de progreso para el PPC, modo oscuro automático y respeto a "reducir movimiento".

**Consecuencias.** Se eliminó la dependencia de Google Fonts: carga más rápida, funciona sin conexión y permite una política de seguridad estricta. Los colores de estado usan las variantes accesibles de Apple para el texto.

## ADR-005 · Rendimiento
**Estado:** aceptada

- **PPC indexado.** El cálculo pasó de recorrer todos los registros por cada día y contratista a usar un índice por (fecha, contratista) que se arma una vez. Con un año de datos (2,500 conteos, 730 incumplimientos), la pantalla de Análisis bajó de 34 ms a 4 ms (8× más rápida).
- **Instalación ligera.** La librería de Excel (940 KB) ya no se descarga al instalar: se baja la primera vez que se exporta. La descarga inicial bajó de 1,123 KB a 225 KB.

**Revisar.** Cada cambio copia el estado completo (`structuredClone`). Con decenas de miles de registros conviene actualizar solo lo que cambia.

## ADR-006 · Seguridad y resiliencia
**Estado:** aceptada

- Encabezados en `vercel.json`: política de contenido estricta (solo el propio sitio y Supabase), HSTS, `nosniff`, sin iframes de terceros y cámara solo para la propia app.
- Pantalla de recuperación: si la interfaz falla, se ofrece recargar y descargar un respaldo de emergencia en lugar de una pantalla en blanco.
- Códigos de invitación aleatorios, de un solo uso y con 7 días de vigencia.

## Pendientes recomendados
1. **Monitoreo de errores** (por ejemplo Sentry) para enterarse de fallas antes que los usuarios.
2. **Pruebas de punta a punta en GitHub Actions** con Playwright y un Supabase de prueba.
3. **Borrado suave y bitácora de cambios** (quién cambió qué y cuándo) para auditoría con clientes.
4. **Exportación con el formato del cliente** configurable por empresa.
5. **Planes y cobro** por proyecto o por usuario, cuando haya clientes.
