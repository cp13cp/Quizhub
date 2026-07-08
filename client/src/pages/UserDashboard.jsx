import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function UserDashboard() {
  const [sets, setSets] = useState([]);
  const [notes, setNotes] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');

  useEffect(() => {
    api
      .get('/api/question-sets')
      .then(setSets)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // load notes
    api.get('/api/notes').then(setNotes).catch(() => {});
  }, []);

  if (loading) return <div className="center">Loading…</div>;

  const categories = Array.from(new Set(sets.map((s) => s.category).filter(Boolean)));
  const visibleSets = categoryFilter === 'all' ? sets : sets.filter((s) => s.category === categoryFilter);

  return (
    <div>
      <h1>Available Question Sets</h1>
      {error && <div className="error">{error}</div>}
      {sets.length === 0 && <p className="muted">No question sets yet. Check back later.</p>}
      <div>
        <div className="filter-bar">
          <button className={`chip ${categoryFilter === 'all' ? 'chip-active' : ''}`} onClick={() => setCategoryFilter('all')}>All</button>
          {categories.map((c) => (
            <button key={c} className={`chip ${categoryFilter === c ? 'chip-active' : ''}`} onClick={() => setCategoryFilter(c)}>{c}</button>
          ))}
        </div>
      <div className="grid">
        {visibleSets.map((s) => (
          <div className="card" key={s.id}>
            <h3>{s.title}</h3>
            {s.description && <p className="muted">{s.description}</p>}
            <div className="card-meta">
              <span>Max score: {s.max_score}</span>
              {s.category && <span className="badge">{s.category}</span>}
              {s.pdf_path && <span className="badge">PDF</span>}
            </div>
            <Link className="btn" to={`/sets/${s.id}`}>Open & answer</Link>
          </div>
        ))}
      </div>
      <h3 style={{ marginTop: 24 }}>Notes</h3>
      {notes.length === 0 && <p className="muted">No notes available yet.</p>}
      <div className="grid">
        {notes.map((n) => (
          <div className="card" key={n.id}>
            <h3>{n.title}</h3>
            {n.description && <p className="muted">{n.description}</p>}
            <div className="card-meta">
              <span>By: {n.uploader_name}</span>
              <a className="btn" href={`/api/notes/${n.id}/download`} target="_blank" rel="noreferrer">Download</a>
            </div>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
