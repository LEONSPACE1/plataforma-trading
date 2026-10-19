# Plataforma Trading

Aplicación web privada (solo por invitación) para ver acciones, índices y divisas de EE. UU. y Colombia, con gráficos de velas y listas de seguimiento que se sincronizan entre computador y celular. Se instala en el celular como una app (PWA).

Próximos pasos del plan: análisis técnico y fundamental con señales, portafolio y alertas.

## Fuentes de datos (gratuitas)

| Mercado | Fuente | Tiempo real |
|---|---|---|
| Acciones y ETF de EE. UU. | Finnhub (si hay `FINNHUB_API_KEY`), si no Yahoo Finance | Sí con Finnhub |
| Índices de EE. UU. (^GSPC, ^DJI…) | Yahoo Finance | Con retraso; SPY/QQQ/DIA en vivo vía Finnhub |
| Acciones e índices de Colombia (`.CL`) | Yahoo Finance | No, ~15–20 min de retraso |
| Divisas (USDCOP=X…) | Yahoo Finance | Casi en tiempo real |
| Gráficos (velas) de todo | Yahoo Finance | — |

Yahoo Finance no es una API oficial: es gratis pero puede cambiar sin aviso. Las cotizaciones se refrescan cada 15 segundos mientras la pestaña está abierta.

## Puesta en marcha (una sola vez)

### 1. Supabase (login y base de datos, plan gratis)

1. Crea un proyecto en <https://supabase.com>.
2. En **SQL Editor**, pega y ejecuta `supabase/migrations/0001_watchlists.sql`.
3. En **Authentication > Sign In / Providers**, desactiva **Allow new users to sign up**. Así nadie puede registrarse solo.
4. En **Authentication > Users > Invite user**, invita tu correo y el de cada persona del círculo.
5. En **Authentication > URL Configuration**, pon tu dominio (ej. `https://plataforma-trading.vercel.app`) en **Site URL** y agrega `https://plataforma-trading.vercel.app/login` y `http://localhost:3000/login` en **Redirect URLs**.
6. En **Project Settings > API** copia la URL y la clave `anon public`.

### 2. Finnhub (opcional, plan gratis)

Regístrate en <https://finnhub.io/register> y copia la API key. Sin ella todo funciona, pero las acciones de EE. UU. llegan con retraso.

### 3. Vercel (alojamiento, plan gratis)

1. En <https://vercel.com> entra con GitHub e importa este repositorio.
2. En **Environment Variables** agrega `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `FINNHUB_API_KEY`.
3. Despliega. Cada cambio en `main` se publica solo.

### 4. Instalar en el celular

Abre la URL en el celular, entra con tu correo y elige **Agregar a pantalla de inicio** (Safari en iPhone, menú ⋮ en Chrome Android).

## Desarrollo local

```bash
cp .env.example .env.local   # y completa los valores
npm install
npm run dev                  # http://localhost:3000
npm test                     # pruebas
```

## Estructura

- `src/lib/market/` — clientes de Yahoo y Finnhub y la lógica que elige la fuente por símbolo.
- `src/app/api/` — rutas del servidor (`quotes`, `candles`, `search`); solo responden a usuarios con sesión.
- `src/app/` — pantallas: tablero (`/`), detalle de activo (`/activo/[símbolo]`), acceso (`/login`).
- `supabase/migrations/` — tablas y reglas de seguridad (cada usuario solo ve sus listas).

> Las señales y recomendaciones de esta plataforma son orientativas y no constituyen asesoría financiera.
