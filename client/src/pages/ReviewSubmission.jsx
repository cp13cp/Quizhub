import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';

export default function ReviewSubmission() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [submission, setSubmission] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/api/submissions/${id}`)
      .then(setSubmission)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="center">Loading…</div>;
  if (error) return <div className="error">{error}</div>;
  if (!submission) return <div className="error">Submission not found.</div>;

  const graded = submission.status === 'graded';

  return (
    <div>
      <button className="btn-ghost" onClick={() => navigate('/history')}>← Back to results</button>
      <h1>Review Submission</h1>
      <div className="panel">
        <p><strong>Question set:</strong> {submission.question_set_title}</p>
        <p><strong>Submitted:</strong> {new Date(submission.submitted_at + 'Z').toLocaleString()}</p>
        <p><strong>Status:</strong> <span className={`badge ${graded ? 'badge-green' : 'badge-amber'}`}>{submission.status}</span></p>
        {graded && <p><strong>Score:</strong> {submission.score} / {submission.max_score}</p>}
        {submission.feedback && <p><strong>Feedback:</strong> {submission.feedback}</p>}
      </div>

      {submission.details?.length > 0 ? (
        <div className="panel result-details">
          <h3>Question review</h3>
          {submission.details.map((q, qi) => (
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
                      {isSelected && !isRight && <span className="muted"> (Your answer)</span>}
                      {isRight && <span className="muted"> (Correct answer)</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        submission.answer_text ? (
          <div className="panel">
            <h3>Your submission</h3>
            <pre className="text-block">{submission.answer_text}</pre>
          </div>
        ) : null
      )}
    </div>
  );
}
