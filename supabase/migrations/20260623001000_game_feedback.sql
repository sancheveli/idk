create table if not exists public.game_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  username text not null,
  rating integer not null check (rating between 1 and 10),
  message text not null check (char_length(trim(message)) between 1 and 800),
  created_at timestamptz not null default now()
);

alter table public.game_feedback enable row level security;

create policy "read game feedback"
  on public.game_feedback for select
  to authenticated
  using (true);

create policy "insert own game feedback"
  on public.game_feedback for insert
  to authenticated
  with check (auth.uid() = user_id);
