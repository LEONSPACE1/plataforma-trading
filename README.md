# Plataforma Trading

Aplicación web privada (solo por invitación) para ver acciones, índices y divisas de EE. UU. y Colombia, con gráficos de velas y listas de seguimiento que se sincronizan entre computador y celular. Se instala en el celular como una app (PWA).

Incluye análisis técnico y fundamental con una señal explicada, un portafolio con ganancias y pérdidas, y alertas de precio y de cambio de señal que llegan como notificación al celular y por Telegram, aunque la app esté cerrada.

## Fuentes de datos (gratuitas)

| Mercado | Fuente | Tiempo real |
|---|---|---|
| Acciones y ETF de EE. UU. | Finnhub (si hay `FINNHUB_API_KEY`), si no Yahoo Finance | Sí con Finnhub |
| Índices de EE. UU. (^GSPC, ^DJI…) | Yahoo Finance | Con retraso; SPY/QQQ/DIA en vivo vía Finnhub |
| Acciones e índices de Colombia (`.CL`) | Yahoo Finance | No, ~15–20 min de retraso |
| Divisas (USDCOP=X…) | Yahoo Finance | Casi en tiempo real |
| Gráficos (velas) de todo | Yahoo Finance | — |
| Fundamentales (P/E, márgenes, deuda) y dividendos | Yahoo Finance (series de estados financieros) | Último reporte trimestral |
| Fechas de resultados (EE. UU.) | Finnhub, calendario de resultados | — |
| Noticias | Yahoo Finance (EE. UU.) y Google Noticias en español (Colombia) | — |
| TRM oficial | datos.gov.co (Superintendencia Financiera) | Diaria |

Yahoo Finance no es una API oficial: es gratis pero puede cambiar sin aviso. Las cotizaciones se refrescan cada 15 segundos mientras la pestaña está abierta.

## Análisis y señal

La página de cada activo calcula, sobre dos años de velas diarias, medias móviles (20, 50, 200), RSI (14), MACD (12, 26, 9), bandas de Bollinger (20, 2) y volumen, y para acciones el P/E, los márgenes, la deuda / patrimonio y el dividendo de los últimos 12 meses. Cada regla vota a favor, neutral o en contra y explica por qué; el puntaje combina 60 % técnico y 40 % fundamental (solo técnico si no hay fundamentales) y da **Comprar** (≥ +30), **Vender** (≤ −30) o **Mantener**. Es una señal orientativa, no asesoría financiera. Las reglas están en `src/lib/analysis/signal.ts`.

## Portafolio y alertas

En **Portafolio** cada usuario registra sus compras (activo, cantidad, precio y fecha) y ve el valor actual, la ganancia o pérdida y el cambio del día, con totales por moneda y un total consolidado en COP usando `USDCOP=X`.

En **Alertas** se crean alertas de precio (sube a / baja a, se disparan una vez) y de cambio de señal (general o solo técnica, con las mismas reglas de la sección anterior). Supabase `pg_cron` llama cada minuto a `/api/cron/alerts`, que revisa precios en cada llamada y señales cada hora, guarda el historial y envía notificaciones push (Web Push con claves VAPID, `public/sw.js`) y mensajes de Telegram. El chat de Telegram se vincula con un enlace `t.me/<bot>?start=<código>` sin webhook. Reglas en `src/lib/alerts/`.

## Screener, calendario, noticias y prueba histórica

- **Screener** (`/screener`): unas 140 acciones y ETF de EE. UU. y Colombia (`src/lib/market/universe.ts`) más los activos que los usuarios tengan en listas o portafolio. La misma revisión programada analiza 8 por minuto y renueva cada uno una vez al día en la tabla `screener`.
- **Calendario** (`/calendario`): próximas fechas de resultados (Finnhub, solo EE. UU.) y la próxima fecha ex-dividendo estimada con la frecuencia de los pagos pasados.
- **Página de cada activo**: noticias, próximos eventos y una prueba histórica de la señal técnica sobre 5 años frente a comprar y mantener (`src/lib/analysis/backtest.ts`).
- **Alertas por indicador**: RSI que cruza un nivel, cruce de medias 50/200 y cruce del MACD; se revisan cada hora y avisan solo al cruzar.
- **Resumen diario**: de lunes a viernes a las 4:15 p. m. de Colombia llega por push y Telegram lo que más se movió, el resultado del día del portafolio, las señales que cambiaron y los eventos de la próxima sesión. Cada usuario lo apaga en **Alertas**.
- **Portafolio**: dividendos cobrados desde cada compra, rendimiento frente al S&P 500 (SPY) o al COLCAP (ICOLCAP), mezcla por mercado y conversión con el dólar en vivo o la TRM oficial.

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

### 4. Alertas

1. En **SQL Editor** ejecuta `supabase/migrations/0002_portafolio_alertas.sql`.
2. En Vercel agrega `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` y `TELEGRAM_BOT_TOKEN` (ver `.env.example`) y vuelve a desplegar.
3. En **SQL Editor** ejecuta `supabase/cron_alertas.sql` con tu `CRON_SECRET`.
4. En **SQL Editor** ejecuta `supabase/migrations/0003_mejoras.sql` (alertas por indicador, resumen diario y screener).

### 5. Instalar en el celular

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
- `src/lib/analysis/` — indicadores técnicos y la señal explicada.
- `src/lib/alerts/` — reglas de alertas, el resumen diario, la revisión programada y el envío por push y Telegram.
- `src/lib/jobs/` — trabajos de la revisión programada: renovar el screener y mandar los resúmenes diarios.
- `src/lib/portfolio.ts` — cálculo de ganancias y pérdidas.
- `src/app/api/` — rutas del servidor; solo responden a usuarios con sesión, salvo `cron/alerts`, que exige `CRON_SECRET`.
- `src/app/` — pantallas: tablero (`/`), detalle de activo (`/activo/[símbolo]`), portafolio (`/portafolio`), screener (`/screener`), calendario (`/calendario`), alertas (`/alertas`), acceso (`/login`).
- `supabase/migrations/` — tablas y reglas de seguridad (cada usuario solo ve sus datos); `supabase/cron_alertas.sql` programa la revisión de alertas.

> Las señales y recomendaciones de esta plataforma son orientativas y no constituyen asesoría financiera.
