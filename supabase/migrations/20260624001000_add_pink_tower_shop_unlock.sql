alter table public.player_shop_accounts
  add column if not exists owns_pink_tower boolean not null default false;
