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
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [timeUp, setTimeUp] = useState(false);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [pinnedTimer, setPinnedTimer] = useState(false);

  useEffect(() => {
    api.get(`/api/question-sets/${id}`).then(setSet).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (!set || !set.duration_minutes || Number(set.duration_minutes) <= 0) {
      setRemainingSeconds(null);
      setTimeUp(false);
      return;
    }
    let seconds = Number(set.duration_minutes) * 60;
    setRemainingSeconds(seconds);
    setTimeUp(false);
    setAutoSubmitted(false);
    // Auto-pin the floating timer when the quiz with a duration is opened
    setPinnedTimer(true);

    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(interval);
          setTimeUp(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [set]);

  const isQuiz = set && set.questions && set.questions.length > 0;

  const doSubmit = async (payload) => {
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/api/submissions', payload);
      setResult(res);
      setAutoSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (isQuiz && !timeUp && Object.keys(answers).length < set.questions.length) {
      setError('Please answer every question before submitting.');
      return;
    }
    await doSubmit({
      question_set_id: Number(id),
      answers: isQuiz ? answers : undefined,
      answer_text: isQuiz ? undefined : answerText,
    });
  };

  useEffect(() => {
    if (timeUp && !autoSubmitted && !busy && !result) {
      doSubmit({
        question_set_id: Number(id),
        answers: isQuiz ? answers : undefined,
        answer_text: isQuiz ? undefined : answerText,
      });
    }
  }, [timeUp, autoSubmitted, busy, result, answers, answerText, id, isQuiz]);

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

  const hasDuration = set && set.duration_minutes && set.duration_minutes > 0;
  const hours = hasDuration ? Math.floor(set.duration_minutes / 60) : 0;
  const minutes = hasDuration ? set.duration_minutes % 60 : 0;

  const formatSeconds = (secs) => {
    if (secs === null) return '';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

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
      {hasDuration && (
        <div className="panel timing-card">
          <strong>Time limit:</strong> {hours > 0 ? `${hours}h ` : ''}{minutes}m
          {remainingSeconds !== null && (
            <span
              className={`timer ${timeUp ? 'timer-danger' : ''}`}
              onClick={() => setPinnedTimer(true)}
              title="Click to pin timer"
              style={{ cursor: 'pointer' }}
            >
              {timeUp ? 'Time is up' : `Remaining: ${formatSeconds(remainingSeconds)}`}
            </span>
          )}
        </div>
      )}

      {pinnedTimer && remainingSeconds !== null && (
        <div
          className={`floating-timer ${timeUp ? 'timer-danger' : ''}`}
          onClick={() => setPinnedTimer(false)}
          title="Click to unpin timer"
        >
          <div className="timer-circle">{timeUp ? '0:00' : formatSeconds(remainingSeconds)}</div>
        </div>
      )}

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
