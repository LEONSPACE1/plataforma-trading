-- Mejoras 1 a 7: alertas por indicador, resumen diario, screener.
-- Se ejecuta una vez en Supabase > SQL Editor, después de 0001 y 0002.

-- 1) Alertas por indicador técnico.
--    rsi_above / rsi_below: el RSI (14) cruza el nivel `target` (1 a 99).
--    ma_cross: la media de 50 cruza la de 200 (cruce dorado o de la muerte).
--    macd_cross: la línea MACD cruza su señal.
--    `last_state` guarda el último lado visto ('arriba' / 'abajo') para avisar solo al cruzar.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.alerts'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%'
  loop
    execute format('alter table public.alerts drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.alerts
  add column if not exists last_state text check (last_state in ('arriba', 'abajo')),
  add constraint alerts_kind_check check (kind in (
    'price_above', 'price_below', 'signal_change', 'technical_change',
    'rsi_above', 'rsi_below', 'ma_cross', 'macd_cross'
  )),
  add constraint alerts_target_needed check (
    (kind in ('price_above', 'price_below', 'rsi_above', 'rsi_below')) = (target is not null)
  ),
  add constraint alerts_rsi_range check (kind not in ('rsi_above', 'rsi_below') or target < 100);

-- 2) Preferencias por usuario (por ahora, si quiere el resumen diario).
create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  daily_summary boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;
create policy "owner reads settings" on public.user_settings
  for select using (user_id = auth.uid());
create policy "owner writes settings" on public.user_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Un resumen por usuario y día; la fila evita mandarlo dos veces.
create table if not exists public.daily_summaries (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.daily_summaries enable row level security;
create policy "owner reads summaries" on public.daily_summaries
  for select using (user_id = auth.uid());

-- 3) Screener: una fila por activo (lista fija + los que tengan los usuarios en
--    listas o portafolio) con su análisis, renovado una vez al día. La escribe
--    solo el servidor (service role); cualquier miembro con sesión la puede leer.
create table if not exists public.screener (
  symbol text primary key check (symbol ~ '^[A-Za-z0-9^=.\-]{1,20}$'),
  name text,
  market text not null check (market in ('us', 'co', 'index', 'fx')),
  currency text,
  price numeric,
  change_percent numeric,
  verdict text check (verdict in ('comprar', 'mantener', 'vender')),
  -- El veredicto anterior y cuándo cambió, para el resumen diario.
  previous_verdict text check (previous_verdict in ('comprar', 'mantener', 'vender')),
  verdict_changed_at timestamptz,
  score integer,
  technical_score integer,
  fundamental_score integer,
  rsi numeric,
  pe numeric,
  dividend_yield numeric,
  net_margin numeric,
  debt_to_equity numeric,
  above_sma200 boolean,
  golden_cross boolean,
  error text,
  updated_at timestamptz
);
create index if not exists screener_updated_idx on public.screener (updated_at nulls first);

alter table public.screener enable row level security;
create policy "members read screener" on public.screener
  for select to authenticated using (true);
