create table if not exists public.player_shop_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  coins integer not null default 0 check (coins >= 0),
  owns_brown_chair boolean not null default false,
  owns_purple_tower boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.player_shop_accounts enable row level security;

create policy "read own shop account"
  on public.player_shop_accounts for select
  to authenticated
  using (auth.uid() = user_id);

create policy "insert own shop account"
  on public.player_shop_accounts for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "update own shop account"
  on public.player_shop_accounts for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
