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
  reported_count integer;
  actual_count integer;
  decision text;
  active_after_join integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.game_server_players
  where user_id = auth.uid()
    and client_id <> p_client_id;

  delete from public.game_server_players
  where last_seen < now() - interval '20 seconds';

  select candidate.id, candidate.reported_player_count, candidate.actual_connected_count
    into selected_server_id, reported_count, actual_count
  from (
    select
      gs.id,
      count(gsp.client_id)::integer as reported_player_count,
      count(gsp.client_id) filter (where gsp.last_seen >= now() - interval '20 seconds')::integer as actual_connected_count
    from public.game_servers gs
    left join public.game_server_players gsp on gsp.server_id = gs.id
    group by gs.id
  ) candidate
  where candidate.actual_connected_count < 6
  order by nullif(regexp_replace(candidate.id, '\D', '', 'g'), '')::integer nulls last, candidate.id
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
    reported_count := 0;
    actual_count := 0;
    decision := 'created new server';

    insert into public.game_servers (id, started_at, updated_at)
    values (selected_server_id, now(), now())
    on conflict (id) do nothing;
  elsif actual_count = 0 then
    decision := 'reused empty server';
  else
    decision := 'selected existing server';
  end if;

  if actual_count = 0 then
    delete from public.game_server_players
    where server_id = selected_server_id;

    update public.game_servers gs
    set started_at = now(),
        updated_at = now()
    where gs.id = selected_server_id;
  end if;

  insert into public.game_server_players (client_id, user_id, server_id, joined_at, last_seen)
  values (p_client_id, auth.uid(), selected_server_id, now(), now())
  on conflict (client_id) do update
  set user_id = excluded.user_id,
      server_id = excluded.server_id,
      joined_at = excluded.joined_at,
      last_seen = excluded.last_seen;

  select count(*)::integer
    into active_after_join
  from public.game_server_players gsp
  where gsp.server_id = selected_server_id
    and gsp.last_seen >= now() - interval '20 seconds';

  raise log 'global matchmaking server_id=% reported_player_count=% actual_connected_player_count=% decision=%',
    selected_server_id,
    coalesce(reported_count, 0),
    active_after_join,
    decision;

  return query
  select gs.id, gs.started_at, now(), active_after_join
  from public.game_servers gs
  where gs.id = selected_server_id;
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
declare
  active_count integer;
  reported_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.game_server_players
  where last_seen < now() - interval '20 seconds';

  update public.game_server_players gsp
  set last_seen = now()
  where gsp.client_id = p_client_id
    and gsp.user_id = auth.uid()
    and gsp.server_id = p_server_id;

  select count(*)::integer
    into reported_count
  from public.game_server_players gsp
  where gsp.server_id = p_server_id;

  select count(*)::integer
    into active_count
  from public.game_server_players gsp
  where gsp.server_id = p_server_id
    and gsp.last_seen >= now() - interval '20 seconds';

  raise log 'global heartbeat server_id=% reported_player_count=% actual_connected_player_count=% decision=%',
    p_server_id,
    coalesce(reported_count, 0),
    coalesce(active_count, 0),
    'heartbeat';

  return query
  select gs.id, gs.started_at, now(), coalesce(active_count, 0)
  from public.game_servers gs
  where gs.id = p_server_id;
end;
$$;
