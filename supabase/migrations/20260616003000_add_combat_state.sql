alter table public.game_server_players
  add column if not exists health integer not null default 100,
  add column if not exists is_dead boolean not null default false;

create or replace function public.update_game_player_state(
  p_client_id text,
  p_server_id text,
  p_nickname text,
  p_position_x double precision,
  p_position_y double precision,
  p_direction text,
  p_phase text,
  p_has_sword boolean,
  p_is_blue boolean,
  p_missing_right_leg boolean,
  p_sword_swinging boolean,
  p_health integer,
  p_is_dead boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.game_server_players gsp
  set nickname = coalesce(nullif(trim(p_nickname), ''), 'Player'),
      position_x = p_position_x,
      position_y = p_position_y,
      direction = p_direction,
      phase = p_phase,
      has_sword = p_has_sword,
      is_blue = p_is_blue,
      missing_right_leg = p_missing_right_leg,
      sword_swinging = p_sword_swinging,
      health = greatest(0, least(100, p_health)),
      is_dead = p_is_dead,
      last_seen = now()
  where gsp.client_id = p_client_id
    and gsp.user_id = auth.uid()
    and gsp.server_id = p_server_id;
end;
$$;
