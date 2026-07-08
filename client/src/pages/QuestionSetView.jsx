import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function QuestionSetView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [set, setSet] = useState(null);
  const [answers, setAnswers] = useState({});   // questionId -> option index
  const [answerText, setAnswerText] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/api/question-sets/${id}`).then(setSet).catch((e) => setError(e.message));
  }, [id]);

  const isQuiz = set && set.questions && set.questions.length > 0;

  const submit = async (e) => {
    e.preventDefault();
    if (isQuiz && Object.keys(answers).length < set.questions.length) {
      setError('Please answer every question before submitting.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/api/submissions', {
        question_set_id: Number(id),
        answers: isQuiz ? answers : undefined,
        answer_text: isQuiz ? undefined : answerText,
      });
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !set) return <div className="error">{error}</div>;
  if (!set) return <div className="center">Loading…</div>;

  // ---- Result screen ----
  if (result) {
    const graded = result.status === 'graded';
    return (
      <div className="auth-card">
        {graded ? (
          <>
            <h1>Your Score</h1>
            <div className="score-big">{result.score} <span className="muted">/ {result.max_score ?? set.max_score}</span></div>
            {result.total != null && <p className="muted">{result.correct} out of {result.total} correct</p>}
            {result.details && result.details.length > 0 && (
              <div className="panel result-details">
                <h3>Question results</h3>
                {result.details.map((q, qi) => (
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
            )}
          </>
        ) : (
          <>
            <h1>Answer submitted ✓</h1>
            <p className="muted">Your submission is pending review. The score will appear in “My Results”.</p>
          </>
        )}
        <div className="row-gap">
          <button className="btn" onClick={() => navigate('/history')}>My Results</button>
          <button className="btn-ghost" onClick={() => navigate('/dashboard')}>Back to quizzes</button>
        </div>
      </div>
    );
  }

  // Reference material (PDF / text) — collapsible so it doesn't hide the questions
  const reference = (set.text_content || set.pdf_path) && (
    <details className="panel reference-details">
      <summary>📎 Reference material {set.pdf_path ? '(PDF)' : ''}</summary>
      {set.text_content && <pre className="text-block">{set.text_content}</pre>}
      {set.pdf_path && (
        <>
          <a className="btn-ghost" href={set.pdf_path} target="_blank" rel="noreferrer">Open PDF ↗</a>
          <iframe title="pdf" src={set.pdf_path} className="pdf-frame" />
        </>
      )}
    </details>
  );

  // ---- Quiz / answer screen ----
  return (
    <div>
      <button className="btn-ghost" onClick={() => navigate('/dashboard')}>← Back</button>
      <h1>{set.title}</h1>
      {set.description && <p className="muted">{set.description}</p>}

      <form onSubmit={submit}>
        {isQuiz ? (
          <>
            <p className="muted">{set.questions.length} question{set.questions.length === 1 ? '' : 's'} · pick one option each.</p>
            {set.questions.map((q, qi) => (
              <section className="panel" key={q.id}>
                <h3 className="qtitle">{qi + 1}. {q.question_text}</h3>
                <div className="options">
                  {q.options.map((opt, oi) => (
                    <label className={`option-pick ${answers[q.id] === oi ? 'picked' : ''}`} key={oi}>
                      <input type="radio" name={`q-${q.id}`}
                        checked={answers[q.id] === oi}
                        onChange={() => setAnswers({ ...answers, [q.id]: oi })} />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </section>
            ))}
            {reference}
          </>
        ) : (
          <>
            {reference}
            <section className="panel">
              <h3>Your Answers</h3>
              <p className="muted">This set has no multiple-choice questions — type your answers below.</p>
              <textarea rows={8} placeholder="Type your answers here…"
                value={answerText} onChange={(e) => setAnswerText(e.target.value)} required />
            </section>
          </>
        )}

        {error && <div className="error">{error}</div>}
        <button className="btn" disabled={busy}>{busy ? 'Submitting…' : 'Submit & get score'}</button>
      </form>
    </div>
  );
}
