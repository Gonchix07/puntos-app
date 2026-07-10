# Contexto del Proyecto — App de Puntos (fidelización)

## Stack tecnológico
- **Frontend**: React 18 + Vite + React Router v6 + Tailwind CSS
- **Backend/DB**: Supabase (Auth, PostgreSQL, RLS, funciones RPC)
- **Deploy**: Vercel (serverless functions en `/api/`)
- Estética basada en el proyecto **giftcards-app** (tema indigo, componentes `ui.jsx`, tablas responsive).

---

## Estructura del proyecto
```
puntos-app/
├── api/
│   ├── admin-users.js     # ABM de usuarios (service_role)
│   ├── clientes.js        # REST API: alta de cliente (emite tarjeta)
│   └── cargar-puntos.js   # REST API: carga de puntos a una tarjeta
├── src/
│   ├── components/
│   │   ├── ui.jsx          # Button, Input, Select, Card, Badge, Stat, money, puntos, formatTarjeta
│   │   ├── Layout.jsx      # Navegación + roles
│   │   ├── ProtectedRoute.jsx
│   │   └── ClienteCombo.jsx # Select editable (nombre/DNI/tarjeta)
│   ├── contexts/AuthContext.jsx  # useAuth() -> { user, profile, role, isAdmin }
│   ├── pages/
│   │   ├── Login.jsx
│   │   ├── Dashboard.jsx     # Estadísticas + gráfico por mes + top clientes
│   │   ├── Clientes.jsx      # ABM clientes (alta emite tarjeta automáticamente)
│   │   ├── CargarPuntos.jsx  # Carga manual por factura (nº + $)
│   │   ├── Auditoria.jsx     # Cargas total/por cliente + export Excel
│   │   ├── Configuracion.jsx # Relación $/punto (admin)
│   │   └── Usuarios.jsx      # ABM usuarios (admin)
│   ├── App.jsx
│   ├── main.jsx
│   ├── supabaseClient.js
│   └── index.css
└── supabase/schema.sql
```

---

## Roles del sistema
| Rol | Acceso |
|---|---|
| `admin` | Todo (incluye Configuración y Usuarios) |
| `operador` | Inicio, Clientes, Cargar puntos, Auditoría (solo lectura de clientes) |

Badge: admin=amber (👑), operador=sky (🧑‍💼).

---

## Base de datos — tablas principales
- **profiles**: id, email, nombre, role ('admin'|'operador')
- **clientes**: id, nombre, dni (único), email, telefono, activo
- **tarjetas**: id, numero (16 dígitos único), cliente_id (único, 1 por cliente), puntos, activa
- **config**: id=1, pesos_por_punto (default 1000 → 1 punto = $1000)
- **cargas**: id, tarjeta_id, cliente_id, numero_tarjeta, cliente_nombre, factura_numero, factura_pesos, pesos_por_punto (snapshot), puntos, origen ('manual'|'api'), usuario_email, created_at

### Número de tarjeta
Secuencia `tarjeta_numero_seq` que arranca en **10000100**, formateada a 16 dígitos con `lpad`.
La primera tarjeta emitida es `0000 0000 1000 0100`, luego `...0101`, `...0102`, etc.

### Funciones / triggers clave
- `cargar_puntos(p_numero, p_factura_pesos, p_factura_numero, p_origen, p_usuario_email)` — RPC atómica: valida tarjeta activa, calcula `floor(pesos / pesos_por_punto)`, suma puntos y registra la carga en `cargas`.
- Trigger `trg_crear_tarjeta_cliente` — al insertar un cliente le emite su tarjeta.
- Trigger `handle_new_user` — crea el perfil al registrar un usuario en Auth.
- Trigger `trg_prevenir_borrado_cliente` — impide borrar clientes con cargas registradas.
- `is_admin()` — helper para las políticas RLS.

---

## API REST (Vercel /api/)
Todas requieren `Authorization: Bearer <access_token>` de un usuario **admin** y `SUPABASE_SERVICE_ROLE_KEY` en el servidor.

### POST /api/clientes
Crea un cliente (y su tarjeta). Body: `nombre*`, `dni*`, `email`, `telefono`.
Respuesta 201: `{ ...cliente, tarjeta: { numero, puntos } }`.

### POST /api/cargar-puntos
Carga puntos. Identificá la tarjeta por `numero` (16 dígitos) **o** por `dni` del cliente.
Body: `factura_pesos*`, `factura_numero`, y (`numero` | `dni`).
Respuesta 201: `{ numero_tarjeta, cliente, factura_pesos, pesos_por_punto, puntos_otorgados, puntos_totales }`.
Registra la carga en `cargas` con `origen = 'api'` atribuida al admin llamante.

### POST/PATCH/DELETE /api/admin-users
ABM de usuarios de Auth.

#### Obtener el Bearer token desde un sistema externo
```http
POST https://TU-PROYECTO.supabase.co/auth/v1/token?grant_type=password
apikey: <anon-key>
Content-Type: application/json

{ "email": "admin@...", "password": "..." }
```
El `access_token` de la respuesta se usa como Bearer (expira en 1 h).

---

## Variables de entorno
### Local (`.env`)
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```
### Vercel (además de las anteriores)
```
SUPABASE_SERVICE_ROLE_KEY
```

---

## Puesta en marcha
1. `npm install`
2. Copiar `.env.example` a `.env` y completar credenciales de Supabase.
3. Ejecutar `supabase/schema.sql` en el SQL Editor de Supabase.
4. Crear el primer usuario admin (Auth) y en `profiles` poner `role = 'admin'`.
5. `npm run dev` (local) — `npm run build` para producción.
