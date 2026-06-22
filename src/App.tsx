import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { Auth } from './components/Auth';
import { Lobby } from './components/Lobby';

function clearSavedRuns() {
  Object.keys(window.localStorage)
    .filter((key) => key.startsWith('brickbattle-run:'))
    .forEach((key) => window.localStorage.removeItem(key));
  Object.keys(window.sessionStorage)
    .filter((key) => key.startsWith('brickbattle-run-session:'))
    .forEach((key) => window.sessionStorage.removeItem(key));
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [gameMenuOpen, setGameMenuOpen] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const nickname =
    session?.user.user_metadata.full_name ||
    session?.user.email?.split('@')[0] ||
    'Player';
  const signOut = () => {
    clearSavedRuns();
    setAuthOpen(false);
    setGameMenuOpen(true);
    void supabase.auth.signOut();
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        setAuthOpen(false);
        setGameMenuOpen(true);
      }
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
      {session && !gameMenuOpen && (
        <header className="header">
          <h1>Spawn Plaza</h1>
          <button className="ghost" onClick={signOut}>
            Sign out
          </button>
        </header>
      )}

      {!session ? authOpen ? (
        <Auth
          onAuthenticated={(nextSession) => {
            setSession(nextSession);
            setAuthOpen(false);
            setGameMenuOpen(true);
          }}
        />
      ) : (
        <Lobby onMenuOpenChange={setGameMenuOpen} onSignInRequest={() => setAuthOpen(true)} />
      ) : (
        <Lobby nickname={nickname} userId={session.user.id} onMenuOpenChange={setGameMenuOpen} onSignOut={signOut} />
      )}
    </main>
  );
}
