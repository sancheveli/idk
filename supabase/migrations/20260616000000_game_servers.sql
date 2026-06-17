create table if not exists public.game_servers (
  id text primary key,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_server_players (
  client_id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  server_id text not null references public.game_servers (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

alter table public.game_servers enable row level security;
alter table public.game_server_players enable row level security;

create policy "read game servers"
  on public.game_servers for select
  using (auth.uid() is not null);

create policy "read game server players"
  on public.game_server_players for select
  using (auth.uid() is not null);

create policy "insert own game server player"
  on public.game_server_players for insert
  with check (auth.uid() = user_id);

create policy "update own game server player"
  on public.game_server_players for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own game server player"
  on public.game_server_players for delete
  using (auth.uid() = user_id);

create or replace function public.join_game_server(p_client_id text)
returns table (
  server_id text,
  started_at timestamptz,
  server_now timestamptz,
  player_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_server_id text;
  active_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.game_server_players
  where last_seen < now() - interval '20 seconds';

  select gs.id
    into selected_server_id
  from public.game_servers gs
  left join public.game_server_players gsp on gsp.server_id = gs.id
  group by gs.id
  having count(gsp.client_id) < 6
  order by nullif(regexp_replace(gs.id, '\D', '', 'g'), '')::integer nulls last, gs.id
  limit 1;

  if selected_server_id is null then
    selected_server_id := 'server-' || (
      coalesce(
        (
          select max(regexp_replace(id, '\D', '', 'g')::integer)
          from public.game_servers
          where id ~ '^server-[0-9]+$'
        ),
        0
      ) + 1
    );

    insert into public.game_servers (id, started_at, updated_at)
    values (selected_server_id, now(), now())
    on conflict (id) do nothing;
  end if;

  select count(*)
    into active_count
  from public.game_server_players
  where server_id = selected_server_id;

  if active_count = 0 then
    update public.game_servers
    set started_at = now(),
        updated_at = now()
    where id = selected_server_id;
  end if;

  insert into public.game_server_players (client_id, user_id, server_id, joined_at, last_seen)
  values (p_client_id, auth.uid(), selected_server_id, now(), now())
  on conflict (client_id) do update
  set user_id = excluded.user_id,
      server_id = excluded.server_id,
      joined_at = excluded.joined_at,
      last_seen = excluded.last_seen;

  return query
  select gs.id, gs.started_at, now(), count(gsp.client_id)::integer
  from public.game_servers gs
  left join public.game_server_players gsp on gsp.server_id = gs.id
  where gs.id = selected_server_id
  group by gs.id, gs.started_at;
end;
$$;

create or replace function public.heartbeat_game_server(p_client_id text, p_server_id text)
returns table (
  server_id text,
  started_at timestamptz,
  server_now timestamptz,
  player_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.game_server_players
  where last_seen < now() - interval '20 seconds';

  update public.game_server_players
  set last_seen = now()
  where client_id = p_client_id
    and user_id = auth.uid()
    and server_id = p_server_id;

  return query
  select gs.id, gs.started_at, now(), count(gsp.client_id)::integer
  from public.game_servers gs
  left join public.game_server_players gsp on gsp.server_id = gs.id
  where gs.id = p_server_id
  group by gs.id, gs.started_at;
end;
$$;

create or replace function public.leave_game_server(p_client_id text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.game_server_players
  where client_id = p_client_id
    and user_id = auth.uid();
$$;
