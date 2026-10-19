-- Listas de seguimiento por usuario. Cada fila pertenece a un usuario y solo él
-- puede leerla o cambiarla (RLS), así que el mismo login ve los mismos datos en
-- el computador y en el celular.

create table public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now()
);

create table public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.watchlists (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Za-z0-9^=.\-]{1,20}$'),
  created_at timestamptz not null default now(),
  unique (watchlist_id, symbol)
);

create index watchlist_items_watchlist_idx on public.watchlist_items (watchlist_id);

alter table public.watchlists enable row level security;
alter table public.watchlist_items enable row level security;

create policy "owner reads watchlists" on public.watchlists
  for select using (user_id = auth.uid());
create policy "owner writes watchlists" on public.watchlists
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "owner reads items" on public.watchlist_items
  for select using (user_id = auth.uid());
create policy "owner writes items" on public.watchlist_items
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = auth.uid())
  );

-- Every invited user starts with one list.
create function public.create_default_watchlist() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.watchlists (user_id, name) values (new.id, 'Mi lista');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_default_watchlist();

-- Push changes to every open device in real time.
alter publication supabase_realtime add table public.watchlists, public.watchlist_items;
