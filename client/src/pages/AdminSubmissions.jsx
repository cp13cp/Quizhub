import { useEffect, useState } from 'react';
import { api } from '../api';

function GradeRow({ sub, onGraded }) {
  const [score, setScore] = useState(sub.score ?? '');
  const [feedback, setFeedback] = useState(sub.feedback ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailError, setDetailError] = useState('');

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const updated = await api.patch(`/api/submissions/${sub.id}/grade`, {
        score: Number(score),
        feedback,
      });
      onGraded(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleDetails = async () => {
    if (!expanded && !details) {
      setLoadingDetails(true);
      setDetailError('');
      try {
        const data = await api.get(`/api/submissions/${sub.id}/detail`);
        setDetails(data);
      } catch (err) {
        setDetailError(err.message);
      } finally {
        setLoadingDetails(false);
      }
    }
    setExpanded((prev) => !prev);
  };

  const payload = details || sub;

  return (
    <div className="card">
      <div className="card-meta">
        <strong>{sub.question_set_title}</strong>
        <span className={`badge ${sub.status === 'graded' ? 'badge-green' : 'badge-amber'}`}>{sub.status}</span>
      </div>
      <p className="muted">
        {sub.user_name} ({sub.user_email}) · {new Date(sub.submitted_at + 'Z').toLocaleString()}
      </p>
      <div className="grade-row">
        <button type="button" className="btn-ghost btn-sm" onClick={toggleDetails}>
          {expanded ? 'Hide details' : 'View details'}
        </button>
      </div>
      {expanded && (
        <div className="panel">
          {loadingDetails && <div className="muted">Loading details…</div>}
          {detailError && <div className="error">{detailError}</div>}
          {!loadingDetails && !detailError && (
            <>
              {payload.details?.length > 0 ? (
                payload.details.map((q, qi) => (
                  <div className="result-item" key={q.question_id}>
                    <div className="result-title">
                      <strong>{qi + 1}. {q.question_text}</strong>
                      <span className={q.correct ? 'tag tag-green' : 'tag tag-red'}>
                        {q.correct ? 'Correct' : 'Incorrect'}
                      </span>
                    </div>
                    <div className="result-options">
                      {q.options.map((opt, oi) => {
                        const isSelected = q.selected_index === oi;
                        const isRight = q.correct_index === oi;
                        return (
                          <div
                            key={oi}
                            className={`result-option ${isRight ? 'correct-option' : ''} ${isSelected ? 'selected-option' : ''}`}
                          >
                            <strong>{String.fromCharCode(65 + oi)}.</strong> {opt}
                            {isSelected && !isRight && <span className="muted"> (Selected)</span>}
                            {isRight && <span className="muted"> (Correct)</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              ) : (
                <pre className="text-block">{payload.answer_text || '(no text)'}</pre>
              )}
            </>
          )}
        </div>
      )}
      <div className="grade-row">
        <label>Score / {sub.max_score}
          <input type="number" min={0} max={sub.max_score} value={score}
            onChange={(e) => setScore(e.target.value)} />
        </label>
        <label>Feedback
          <input value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Optional" />
        </label>
        <button className="btn" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : sub.status === 'graded' ? 'Update grade' : 'Record score'}
        </button>
      </div>
      {error && <div className="error">{error}</div>}
    </div>
  );
}

export default function AdminSubmissions() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    api
      .get('/api/submissions')
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const onGraded = (updated) =>
    setRows((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));

  if (loading) return <div className="center">Loading…</div>;

  const visible = rows.filter((r) => filter === 'all' || r.status === filter);

  return (
    <div>
      <h1>Submissions</h1>
      {error && <div className="error">{error}</div>}
      <div className="filter-bar">
        {['all', 'pending', 'graded'].map((f) => (
          <button key={f} className={`chip ${filter === f ? 'chip-active' : ''}`} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>
      {visible.length === 0 && <p className="muted">No submissions.</p>}
      <div className="grid">
        {visible.map((sub) => (
          <GradeRow key={sub.id} sub={sub} onGraded={onGraded} />
        ))}
      </div>
    </div>
  );
}
