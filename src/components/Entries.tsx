import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Entry = {
  id: string;
  title: string;
  created_at: string;
};

export function Entries({ userEmail }: { userEmail: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const { data, error } = await supabase
      .from('entries')
      .select('id, title, created_at')
      .order('created_at', { ascending: false });

    if (error) setError(error.message);
    else setEntries(data ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    const { error } = await supabase.from('entries').insert({ title: title.trim() });

    if (error) {
      setError(error.message);
      return;
    }

    setError('');
    setTitle('');
    load();
  }

  async function remove(id: string) {
    const { error } = await supabase.from('entries').delete().eq('id', id);

    if (error) {
      setError(error.message);
      return;
    }

    setError('');
    load();
  }

  return (
    <section className="card">
      <p className="hello">Signed in as {userEmail}</p>
      <h2>My entries</h2>

      <form onSubmit={add} className="form-row">
        <input
          placeholder="What would you like to add?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit">Add</button>
      </form>

      {error && <p className="message">{error}</p>}

      {entries.length === 0 ? (
        <p className="empty">Nothing here yet. Add your first entry.</p>
      ) : (
        <ul className="list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <span>{entry.title}</span>
              <button className="ghost small" onClick={() => remove(entry.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
