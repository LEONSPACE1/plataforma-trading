-- Paso 4: portafolio, alertas y canales de notificación.
-- Como en 0001, cada fila pertenece a un usuario y RLS solo deja verla a él.
-- El evaluador de alertas (/api/cron/alerts) usa la service role key, que se
-- salta RLS, para leer las alertas de todos y escribir el historial.

-- Posiciones (compras) del portafolio.
create table public.positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Za-z0-9^=.\-]{1,20}$'),
  quantity numeric not null check (quantity > 0),
  buy_price numeric not null check (buy_price > 0),
  bought_on date not null default current_date,
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);

create index positions_user_idx on public.positions (user_id);

-- Alertas. price_above / price_below se disparan una vez y quedan inactivas;
-- signal_change (señal combinada) y technical_change (solo técnica) avisan cada
-- vez que la señal cambia entre Comprar, Mantener y Vender.
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Za-z0-9^=.\-]{1,20}$'),
  kind text not null check (kind in ('price_above', 'price_below', 'signal_change', 'technical_change')),
  target numeric check (target > 0),
  active boolean not null default true,
  last_verdict text check (last_verdict in ('comprar', 'mantener', 'vender')),
  last_checked_at timestamptz,
  last_triggered_at timestamptz,
  created_at timestamptz not null default now(),
  check ((kind in ('price_above', 'price_below')) = (target is not null))
);

create index alerts_active_idx on public.alerts (active) where active;

-- Historial de alertas disparadas (lo escribe solo el servidor).
create table public.alert_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  alert_id uuid references public.alerts (id) on delete set null,
  symbol text not null,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index alert_events_user_idx on public.alert_events (user_id, created_at desc);

-- Suscripciones de notificaciones push, una por navegador o celular.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Chat de Telegram vinculado. El servidor guarda el chat_id cuando el usuario
-- le escribe /start <código> al bot, así nadie puede apuntar sus alertas a un
-- chat ajeno.
create table public.telegram_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  link_code text unique,
  chat_id bigint,
  created_at timestamptz not null default now()
);

alter table public.positions enable row level security;
alter table public.alerts enable row level security;
alter table public.alert_events enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.telegram_links enable row level security;

create policy "owner reads positions" on public.positions
  for select using (user_id = auth.uid());
create policy "owner writes positions" on public.positions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "owner reads alerts" on public.alerts
  for select using (user_id = auth.uid());
create policy "owner writes alerts" on public.alerts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "owner reads alert events" on public.alert_events
  for select using (user_id = auth.uid());
create policy "owner deletes alert events" on public.alert_events
  for delete using (user_id = auth.uid());

create policy "owner reads push subscriptions" on public.push_subscriptions
  for select using (user_id = auth.uid());
create policy "owner writes push subscriptions" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "owner reads telegram link" on public.telegram_links
  for select using (user_id = auth.uid());
create policy "owner unlinks telegram" on public.telegram_links
  for delete using (user_id = auth.uid());

alter publication supabase_realtime add table public.positions, public.alerts, public.alert_events;
