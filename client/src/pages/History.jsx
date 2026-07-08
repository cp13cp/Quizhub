import { useEffect, useState } from 'react';
import { api } from '../api';

function StatusBadge({ status }) {
  return <span className={`badge ${status === 'graded' ? 'badge-green' : 'badge-amber'}`}>{status}</span>;
}

export default function History() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/api/submissions/mine')
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="center">Loading…</div>;

  return (
    <div>
      <h1>My Results</h1>
      {error && <div className="error">{error}</div>}
      {rows.length === 0 && <p className="muted">You haven’t submitted any answers yet.</p>}
      {rows.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Question Set</th>
              <th>Submitted</th>
              <th>Status</th>
              <th>Score</th>
              <th>Feedback</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.question_set_title}</td>
                <td>{new Date(r.submitted_at + 'Z').toLocaleString()}</td>
                <td><StatusBadge status={r.status} /></td>
                <td>{r.status === 'graded' ? `${r.score} / ${r.max_score}` : '—'}</td>
                <td className="muted">{r.feedback || '—'}</td>
                <td>
                  {r.status === 'graded' && (
                    <button className="btn-ghost" onClick={() => window.location.href = `/review/${r.id}`}>Review</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
