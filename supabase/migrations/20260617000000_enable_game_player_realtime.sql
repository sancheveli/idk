do $$
begin
  alter publication supabase_realtime add table public.game_server_players;
exception
  when duplicate_object then null;
end;
$$;
