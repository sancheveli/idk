alter table public.player_shop_accounts
  add column if not exists tower_decorations jsonb;
