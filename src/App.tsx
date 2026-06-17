import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { Auth } from './components/Auth';
import { Lobby } from './components/Lobby';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const nickname =
    session?.user.user_metadata.full_name ||
    session?.user.email?.split('@')[0] ||
    'Player';

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <main className="container">
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main className="container">
      <header className="header">
        <h1>{session ? 'Spawn Plaza' : 'My Project'}</h1>
        {session && (
          <button className="ghost" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        )}
      </header>

      {!session ? (
        <Auth onAuthenticated={setSession} />
      ) : (
        <Lobby nickname={nickname} userId={session.user.id} />
      )}
    </main>
  );
}
