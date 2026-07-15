# Contexto del Proyecto — App de Puntos (fidelización)

## Stack tecnológico
- **Frontend**: React 18 + Vite + React Router v6 + Tailwind CSS
- **Backend/DB**: Supabase (Auth, PostgreSQL, RLS, funciones RPC, Storage)
- **Deploy**: Vercel (serverless functions en `/api/`)
- Estética basada en **giftcards-app** (componentes `ui.jsx`, tablas responsive). El **header** usa un degradado violeta (`from-violet-950 via-violet-800 to-violet-600`) y el layout es a **ancho completo** (`w-full px-6`).

---

## Estructura del proyecto
```
puntos-app/
├── api/
│   ├── admin-users.js     # ABM de usuarios (service_role)
│   ├── clientes.js        # REST API: alta de cliente (emite tarjeta)
│   └── cargar-puntos.js   # REST API: carga de puntos (comercio obligatorio)
├── src/
│   ├── components/
│   │   ├── ui.jsx          # Button, Input, Select, Card, Badge, Stat, money, puntos, formatTarjeta
│   │   ├── Layout.jsx      # Navegación (con menús desplegables) + roles
│   │   ├── ProtectedRoute.jsx
│   │   └── ClienteCombo.jsx # Select editable (nombre/DNI/tarjeta)
│   ├── contexts/AuthContext.jsx  # useAuth() -> { user, profile, role, isAdmin }
│   ├── pages/
│   │   ├── Login.jsx
│   │   ├── Dashboard.jsx        # Estadísticas con selectores de Período y Comercio
│   │   ├── Clientes.jsx         # ABM + import Excel + baja lógica + acción "Movimientos"
│   │   ├── CargarPuntos.jsx     # Carga manual por factura (comercio + nº + $)
│   │   ├── Premios.jsx          # Catálogo e-commerce + alta (admin) + solicitar canje
│   │   ├── SolicitudesPremios.jsx # Flujo de estados de las solicitudes de canje
│   │   ├── Auditoria.jsx        # Movimientos (cargas + canjes) total/por cliente/por comercio + Excel
│   │   ├── Configuracion.jsx    # $/punto + tope de importe por factura (admin)
│   │   ├── Comercios.jsx        # ABM de comercios + logo (admin)
│   │   └── Usuarios.jsx         # ABM usuarios (admin)
│   ├── App.jsx / main.jsx / supabaseClient.js / index.css
└── supabase/
    ├── schema.sql                      # Esquema completo (fresh install)
    └── migration_*.sql                 # Migraciones incrementales (ver más abajo)
```

---

## Menú de navegación
- **Admin**: Inicio · Clientes · Cargar puntos · **Premios ▾** (Alta Premio · Solicitudes) · **Configuración ▾** (Parámetros · Comercios · Usuarios) · Auditoría
- **Operador**: Inicio · Clientes · Cargar puntos · **Premios ▾** · Auditoría
- Los desplegables (`NavDropdown` en `Layout.jsx`) se aplanan en mobile.

## Roles
| Rol | Acceso |
|---|---|
| `admin` | Todo (Configuración: Parámetros, Comercios, Usuarios) |
| `operador` | Inicio, Clientes, Cargar puntos, Premios, Auditoría |

Badge: admin=amber (👑), operador=sky (🧑‍💼).

---

## Modelo de puntos (importante)
Los puntos se **acumulan por comercio** (cada carga tiene su comercio). Cada tarjeta guarda dos valores:
- **`puntos`** = puntos **acumulados** (reales). Solo bajan cuando un canje se hace **efectivo** (al confirmar la solicitud).
- **`puntos_remanentes`** = **disponibles** = acumulados − canjes pendientes. Al crear una solicitud se reserva (baja remanentes); al rechazar se libera; al confirmar, bajan los acumulados y la reserva queda aplicada.

El saldo neto por comercio se calcula con la vista **`saldos_por_comercio`** = cargas(+) − `canje_detalle`(−).

---

## Base de datos — tablas
- **profiles**: id, email, nombre, role ('admin'|'operador')
- **clientes**: id, nombre, dni (único, `^[1-9][0-9]{6,7}$` → 1.000.000–99.999.999), email (obligatorio en el front), telefono, activo, **cliente_web** (tilde en el form; badge 🌐 en el listado), **codigo_interno** (opcional, 5 caracteres alfanuméricos, `CHECK` en DB; buscable en el listado)
- **tarjetas**: id, numero (16 díg. único), cliente_id (único, 1 por cliente), **puntos** (acumulados), **puntos_remanentes** (disponibles), activa
- **config**: id=1, pesos_por_punto (default 1000), **max_factura_pesos** (default 9.999.999)
- **comercios**: id, nombre (único), **logo_url**, activo
- **cargas**: tarjeta_id, cliente_id, numero_tarjeta, cliente_nombre, **comercio_id**, **comercio_nombre**, factura_numero (**único** cuando no es null), factura_pesos, pesos_por_punto (snapshot), puntos, origen ('manual'|'api'), usuario_email, created_at
- **premios**: titulo, descripcion, foto_url, puntos_necesarios, stock, **comercio_id** (null = general/para todos), activo
- **canjes**: premio_id, premio_titulo, cliente_id, cliente_nombre, tarjeta_id, numero_tarjeta, puntos, **comercio_id/comercio_nombre** (del premio; null = general), usuario_email
- **canje_detalle**: canje_id, comercio_id, puntos — de qué comercio(s) salieron los puntos (reparto de canjes generales)
- **solicitudes**: premio/cliente/tarjeta/comercio (snapshots), puntos, **estado** ('pendiente'|'revision'|'confirmado'|'entregado'|'rechazada'), canje_id, solicitado_por, actualizado_por, created_at, updated_at

### Número de tarjeta
Secuencia `tarjeta_numero_seq` desde **10000100**, formateada a 16 díg. con `lpad`. Primera: `0000 0000 1000 0100`.

### Funciones / triggers clave
- **`cargar_puntos(p_numero, p_factura_pesos, p_factura_numero, p_origen, p_usuario_email, p_comercio_id)`** — RPC atómica. Valida: comercio obligatorio, factura única, tope `max_factura_pesos`, tarjeta activa. Calcula `floor(pesos / pesos_por_punto)`, suma a `puntos` **y** `puntos_remanentes`, registra en `cargas`.
- **`canjear_premio(p_cliente_id, p_premio_id, p_usuario_email)`** — RPC atómica del canje efectivo. Premio de comercio → descuenta del saldo de ese comercio; premio general → del total, repartiendo entre comercios (mayor saldo primero) y registrando el reparto en `canje_detalle`. Baja `puntos` (acumulados) y `stock`.
- **`crear_solicitud(p_cliente_id, p_premio_id, p_usuario_email)`** — valida remanentes (total y por comercio) y **reserva** (baja `puntos_remanentes`); crea la solicitud en `pendiente`.
- **`cambiar_estado_solicitud(p_solicitud_id, p_nuevo_estado, p_usuario_email)`** — aplica el flujo; al **confirmar** llama a `canjear_premio`; al **rechazar** libera la reserva de remanentes.
- **`saldos_cliente(p_cliente_id)`** — devuelve por comercio: `saldo`, `pendiente`, `remanente`.
- **`saldos_por_comercio`** (vista) — saldo neto por (cliente, comercio).
- **Triggers**: `trg_crear_tarjeta_cliente` (emite tarjeta al alta de cliente), `handle_new_user` (perfil al registrar en Auth), `trg_prevenir_borrado_cliente` (no borra clientes con **cargas o canjes** → solo baja lógica), `trg_sync_tarjeta_activa` (baja/alta del cliente sincroniza `tarjetas.activa`). `is_admin()` helper de RLS.

### Storage (buckets públicos)
- **`premios`** — fotos de premios. **`comercios`** — logos de comercios. Lectura pública; escritura solo admin.

---

## Flujo de canje de premios
1. En **Premios → Alta Premio**, "Solicitar canje" crea una **solicitud** en estado `pendiente` (valida remanentes; **no descuenta**).
2. En **Premios → Solicitudes** se gestiona el ciclo:
   `pendiente` → (Pasar a revisión) `revision` → (**Confirmar canje** = descuenta puntos+stock) `confirmado` → (Marcar entregado) `entregado`. Desde pendiente/revisión se puede `rechazada` (libera la reserva).

---

## Validaciones y formatos (front)
- **Email** obligatorio en alta de cliente (form e import Excel).
- **DNI** número 1.000.000–99.999.999 (front, import, API y `CHECK` en DB).
- **N° de factura** con formato AFIP `0001-00001234` (máscara al escribir + relleno con ceros al salir) y **único**.
- **Importe por factura** con separador de miles y **tope configurable**.
- **Puntos necesarios** (premios) con separador de miles al escribir.
- Import masivo de clientes por **Excel** (plantilla descargable con SheetJS). Incluye columnas opcionales **cliente web (SI/NO)** y **codigo interno** (5 alfanuméricos).

---

## Dashboard
- Selector de **Período** (7/30/90 días, año, todo) y selector de **Vista** (General o por comercio).
- KPIs de clientes, tarjetas, puntos en circulación, otorgados, facturado, canjes, premios, stock; gráfico de puntos por mes; top clientes; top premios; últimos canjes. En vista por comercio usa el ledger por comercio (`canje_detalle`).

---

## API REST (Vercel /api/)
Requieren `Authorization: Bearer <access_token>` de un **admin** y `SUPABASE_SERVICE_ROLE_KEY` en el servidor.
- **POST /api/clientes** — crea cliente (y tarjeta). Body: `nombre*`, `dni*`, `email`, `telefono`.
- **POST /api/cargar-puntos** — carga puntos. Body: `factura_pesos*`, `comercio*` (nombre) o `comercio_id`, `factura_numero`, y (`numero` | `dni`). `origen = 'api'`.
- **POST/PATCH/DELETE /api/admin-users** — ABM de usuarios de Auth.

#### Bearer token desde un sistema externo
```http
POST https://TU-PROYECTO.supabase.co/auth/v1/token?grant_type=password
apikey: <anon-key>
Content-Type: application/json

{ "email": "admin@...", "password": "..." }
```

---

## Variables de entorno
- **Local (`.env`)**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- **Vercel (además)**: `SUPABASE_SERVICE_ROLE_KEY`

⚠️ La `VITE_SUPABASE_URL` usa el **ref** del proyecto (subdominio aleatorio, ej. `https://xxxx.supabase.co`), no el nombre del proyecto.

---

## Puesta en marcha / migraciones
1. `npm install` y copiar `.env.example` → `.env` con las credenciales.
2. Ejecutar `supabase/schema.sql` (instalación desde cero — ya incluye todo).
3. Crear el primer usuario admin (Auth) y en `profiles` poner `role = 'admin'`.
4. `npm run dev` (local) / `npm run build` (prod). El ABM de usuarios y la API `/api/*` requieren `vercel dev` o deploy en Vercel.

**Orden de migraciones incrementales** (si la base ya existía, correr en este orden):
```
migration_premios.sql            # catálogo de premios + canje + bucket fotos
migration_factura_unica.sql      # nº de factura único
migration_max_factura.sql        # tope de importe configurable
migration_baja_cliente.sql       # baja lógica (no borrar con movimientos) + sync tarjeta
migration_dni_valido.sql         # CHECK de DNI
migration_comercios.sql          # comercios + comercio en cargas
migration_premios_comercio.sql   # premios por comercio/generales + canje_detalle + saldos
migration_solicitudes.sql        # solicitudes (flujo de estados)
migration_puntos_remanentes.sql  # puntos remanentes (reserva de pendientes)
migration_comercio_logo.sql      # logo_url + bucket comercios
migration_cliente_web.sql        # tilde "Cliente Web" en clientes
migration_codigo_interno.sql     # código cliente interno (5 alfanuméricos, opcional)
```
> Nota: `schema.sql` ya refleja el estado final; las migraciones son para bases creadas antes de cada cambio.
