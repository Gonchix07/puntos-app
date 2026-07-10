# ⭐ Puntos — Programa de fidelización

App React + Supabase para otorgar a cada cliente una **tarjeta virtual única de 16 dígitos** y acumular **puntos** según el importe de sus facturas.

## Funcionalidades
- **Clientes**: alta/edición/baja. Al crear un cliente se le emite automáticamente su tarjeta (`0000 0000 1000 0100` en adelante).
- **Carga de puntos**: manual por factura (n° + importe) o vía **API REST**. Los puntos se calculan como `importe ÷ pesos por punto`.
- **Configuración**: relación pesos/punto (arranca en 1 punto = $1000).
- **Auditoría**: consulta de todas las cargas, total o filtradas por cliente/origen/fecha, con export a Excel.
- **Dashboard**: estadísticas, puntos por mes y ranking de clientes.

## Puesta en marcha
```bash
npm install
cp .env.example .env   # completar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm run dev
```

1. Ejecutá `supabase/schema.sql` en el **SQL Editor** de Supabase.
2. Creá tu primer usuario en **Authentication** y en la tabla `profiles` poné `role = 'admin'`.
3. En Vercel agregá `SUPABASE_SERVICE_ROLE_KEY` para habilitar `/api` (ABM de usuarios y API REST).

Más detalles en [`CONTEXTO_PROYECTO.md`](./CONTEXTO_PROYECTO.md).
