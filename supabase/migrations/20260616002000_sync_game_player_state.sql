alter table public.game_server_players
  add column if not exists nickname text not null default 'Player',
  add column if not exists position_x double precision not null default 500,
  add column if not exists position_y double precision not null default 330,
  add column if not exists direction text not null default 'front',
  add column if not exists phase text not null default 'lobby',
  add column if not exists has_sword boolean not null default false,
  add column if not exists is_blue boolean not null default false,
  add column if not exists missing_right_leg boolean not null default false,
  add column if not exists sword_swinging boolean not null default false;

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
  p_sword_swinging boolean
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
      last_seen = now()
  where gsp.client_id = p_client_id
    and gsp.user_id = auth.uid()
    and gsp.server_id = p_server_id;
end;
$$;
