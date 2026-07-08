import { useEffect, useState } from 'react';
import { api } from '../api';

const emptyQuestion = () => ({ question_text: '', options: ['', ''], correct_index: 0 });

function QuestionBuilder({ questions, setQuestions }) {
  const update = (qi, patch) =>
    setQuestions(questions.map((q, i) => (i === qi ? { ...q, ...patch } : q)));

  const setOption = (qi, oi, value) => {
    const q = questions[qi];
    const options = q.options.map((o, i) => (i === oi ? value : o));
    update(qi, { options });
  };

  const addOption = (qi) => update(qi, { options: [...questions[qi].options, ''] });

  const removeOption = (qi, oi) => {
    const q = questions[qi];
    if (q.options.length <= 2) return;
    const options = q.options.filter((_, i) => i !== oi);
    const correct_index = q.correct_index >= options.length ? 0 : q.correct_index;
    update(qi, { options, correct_index });
  };

  return (
    <div className="qbuilder">
      {questions.map((q, qi) => (
        <div className="qcard" key={qi}>
          <div className="qcard-head">
            <strong>Question {qi + 1}</strong>
            <button type="button" className="btn-danger btn-sm"
              onClick={() => setQuestions(questions.filter((_, i) => i !== qi))}>Remove</button>
          </div>
          <input placeholder="Question text"
            value={q.question_text}
            onChange={(e) => update(qi, { question_text: e.target.value })} />
          <p className="hint">Select the radio button next to the correct option.</p>
          {q.options.map((opt, oi) => (
            <div className="option-row" key={oi}>
              <input type="radio" name={`correct-${qi}`}
                checked={q.correct_index === oi}
                onChange={() => update(qi, { correct_index: oi })} />
              <input placeholder={`Option ${oi + 1}`} value={opt}
                onChange={(e) => setOption(qi, oi, e.target.value)} />
              <button type="button" className="btn-ghost btn-sm"
                disabled={q.options.length <= 2}
                onClick={() => removeOption(qi, oi)}>✕</button>
            </div>
          ))}
          <button type="button" className="btn-ghost btn-sm" onClick={() => addOption(qi)}>+ Add option</button>
        </div>
      ))}
      <button type="button" className="btn-ghost" onClick={() => setQuestions([...questions, emptyQuestion()])}>
        + Add question
      </button>
    </div>
  );
}

export default function AdminDashboard() {
  const [sets, setSets] = useState([]);
  const [notes, setNotes] = useState([]);
  const [error, setError] = useState('');
  const [rawText, setRawText] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', text_content: '', max_score: 100, category: '' });
  const [questions, setQuestions] = useState([emptyQuestion()]);
  const [pdf, setPdf] = useState(null);

  const load = () => api.get('/api/question-sets').then(setSets).catch((e) => setError(e.message));
  const loadNotes = () => api.get('/api/notes').then(setNotes).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  useEffect(() => { loadNotes(); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const CATEGORIES = [
    'HTML', 'CSS', 'JAVASCRIPT', 'REACT JS', 'NODE JS', 'EXPRESS JS', 'AI', 'DSA', 'SQL', 'MONGODB'
  ];

  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [editingId, setEditingId] = useState(null);

  // Upload a PDF, auto-extract questions, and fill the builder for review.
  const importFromPdf = async (file) => {
    if (!file) return;
    setImporting(true);
    setImportMsg('');
    setError('');
    setRawText('');
    try {
      const fd = new FormData();
      fd.append('pdf', file);
      const res = await api.postForm('/api/parse-pdf', fd);
      const imported = res.questions.map((q) => ({
        question_text: q.question_text,
        options: q.options.length >= 2 ? q.options : [...q.options, ''],
        correct_index: q.correct_index ?? 0,
      }));
      setQuestions(imported);
      setImportMsg(`✓ Imported ${res.count} question${res.count === 1 ? '' : 's'}. Review the correct answers below, then create the quiz.`);
    } catch (err) {
      setError(err.message || 'Failed to parse PDF');
      if (err.payload?.raw_text) {
        setRawText(err.payload.raw_text);
      }
    } finally {
      setImporting(false);
    }
  };

  const create = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      // Keep only fully filled-in questions
      const cleaned = questions
        .map((q) => ({ ...q, options: q.options.map((o) => o.trim()) }))
        .filter((q) => q.question_text.trim() && q.options.filter(Boolean).length >= 2);

      // Warn if the admin is about to create a quiz with no clickable questions
      if (cleaned.length === 0) {
        const ok = confirm(
          'You have not added any multiple-choice questions.\n\n' +
          'Users will NOT see clickable options — only the PDF/text, with manual grading.\n\n' +
          'Add questions in the "Multiple-choice questions" section to make them clickable.\n\n' +
          'Create as PDF/text-only anyway?'
        );
        if (!ok) { setBusy(false); return; }
      }

      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('description', form.description);
      fd.append('text_content', form.text_content);
      fd.append('max_score', form.max_score);
      fd.append('category', form.category);
      fd.append('questions', JSON.stringify(cleaned));
      if (pdf) fd.append('pdf', pdf);
      if (editingId) {
        await api.patchForm(`/api/question-sets/${editingId}`, fd);
      } else {
        await api.postForm('/api/question-sets', fd);
      }
      setForm({ title: '', description: '', text_content: '', max_score: 100, category: '' });
      setQuestions([emptyQuestion()]);
      setPdf(null);
      setEditingId(null);
      e.target.reset();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const loadSetForEdit = async (id) => {
    setBusy(true);
    setError('');
    try {
      const data = await api.get(`/api/question-sets/${id}`);
      setForm({
        title: data.title,
        description: data.description || '',
        text_content: data.text_content || '',
        max_score: data.max_score || 100,
        category: data.category || ''
      });
      const imported = (data.questions || []).map((q) => ({
        question_text: q.question_text,
        options: q.options || ['', ''],
        correct_index: q.correct_index ?? 0,
      }));
      setQuestions(imported.length ? imported : [emptyQuestion()]);
      setPdf(null);
      setEditingId(id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ title: '', description: '', text_content: '', max_score: 100, category: '' });
    setQuestions([emptyQuestion()]);
    setPdf(null);
  };

  const remove = async (id) => {
    if (!confirm('Delete this question set and all its submissions?')) return;
    await api.del(`/api/question-sets/${id}`);
    load();
  };

  // Notes upload
  const [noteTitle, setNoteTitle] = useState('');
  const [noteDesc, setNoteDesc] = useState('');
  const [noteFile, setNoteFile] = useState(null);
  const [noteBusy, setNoteBusy] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);

  const uploadNote = async (e) => {
    e.preventDefault();
    setNoteBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('title', noteTitle);
      fd.append('description', noteDesc);
      if (noteFile) fd.append('file', noteFile);
      if (editingNoteId) {
        await api.patchForm(`/api/notes/${editingNoteId}`, fd);
        setEditingNoteId(null);
      } else {
        await api.postForm('/api/notes', fd);
      }
      setNoteTitle(''); setNoteDesc(''); setNoteFile(null); e.target.reset();
      loadNotes();
    } catch (err) {
      setError(err.message);
    } finally { setNoteBusy(false); }
  };

  const startEditNote = (n) => {
    setEditingNoteId(n.id);
    setNoteTitle(n.title || '');
    setNoteDesc(n.description || '');
    setNoteFile(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteNote = async (id) => {
    if (!confirm('Delete this note?')) return;
    await api.del(`/api/notes/${id}`);
    loadNotes();
  };

  return (
    <div>
      <h1>Question Sets</h1>

      <section className="panel">
        <h3>Create a new quiz</h3>
        <form onSubmit={create}>
          <label>Title
            <input value={form.title} onChange={set('title')} required />
          </label>
          <label>Description
            <input value={form.description} onChange={set('description')} placeholder="Optional" />
          </label>

          <label>Category
            <select value={form.category} onChange={set('category')}>
              <option value="">Select subject (optional)</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <div className="import-box">
            <strong>📄 Import questions from a PDF</strong>
            <p className="hint">
              PDF format: number each question (<code>1.</code>), list options (<code>A) …</code>,
              <code> B) …</code>), and add an <code>Answer: B</code> line for auto-grading.
            </p>
            <input type="file" accept="application/pdf" disabled={importing}
              onChange={(e) => { importFromPdf(e.target.files[0]); e.target.value = ''; }} />
            {importing && <span className="muted"> Reading PDF…</span>}
            {importMsg && <div className="import-ok">{importMsg}</div>}
          </div>

          <h4 className="section-label">Multiple-choice questions</h4>
          <p className="hint">Type questions manually, or import them from a PDF above. You can edit imported questions before saving.</p>
          <QuestionBuilder questions={questions} setQuestions={setQuestions} />

          <details className="reference-details">
            <summary>Optional reference material (text / PDF)</summary>
            <label>Reference text
              <textarea rows={3} value={form.text_content} onChange={set('text_content')}
                placeholder="Any extra text shown to the user (optional)." />
            </label>
            <label>Reference PDF
              <input type="file" accept="application/pdf" onChange={(e) => setPdf(e.target.files[0] || null)} />
            </label>
          </details>

          <label>Max score
            <input type="number" min={1} value={form.max_score} onChange={set('max_score')} />
          </label>
          {error && <div className="error">{error}</div>}
          {rawText && (
            <div className="panel raw-text-preview">
              <div className="panel-head"><strong>Extracted PDF text</strong></div>
              <pre>{rawText}</pre>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" disabled={busy}>{busy ? 'Saving…' : (editingId ? 'Save changes' : 'Create quiz')}</button>
            {editingId && <button type="button" className="btn-ghost" onClick={cancelEdit}>Cancel</button>}
          </div>
        </form>
      </section>

      <h3>Existing sets</h3>
      {sets.length === 0 && <p className="muted">No question sets yet.</p>}
      <div className="grid">
        {sets.map((s) => (
          <div className="card" key={s.id}>
            <h3>{s.title}</h3>
            {s.description && <p className="muted">{s.description}</p>}
            <div className="card-meta">
              <span>{s.question_count} question{s.question_count === 1 ? '' : 's'}</span>
              <span>Max: {s.max_score}</span>
              {s.category && <span className="badge">{s.category}</span>}
              {s.pdf_path && <a className="badge" href={s.pdf_path} target="_blank" rel="noreferrer">PDF ↗</a>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" onClick={() => loadSetForEdit(s.id)}>Edit</button>
              <button className="btn-danger" onClick={() => remove(s.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
      <h3 style={{ marginTop: 24 }}>Notes</h3>
      <section className="panel">
        <h4>Upload notes for users</h4>
        <form onSubmit={uploadNote}>
          <label>Title
            <input value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} required />
          </label>
          <label>Description
            <input value={noteDesc} onChange={(e) => setNoteDesc(e.target.value)} placeholder="Optional" />
          </label>
          <label>File (PDF / TXT / Word)
            <input type="file" accept=".pdf,.txt,.doc,.docx" onChange={(e) => setNoteFile(e.target.files[0] || null)} />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" disabled={noteBusy}>{noteBusy ? 'Uploading…' : 'Upload note'}</button>
          </div>
        </form>
      </section>

      <div className="grid">
        {notes.map((n) => (
          <div className="card" key={n.id}>
            <h3>{n.title}</h3>
            {n.description && <p className="muted">{n.description}</p>}
            <div className="card-meta">
              <span>By: {n.uploader_name}</span>
              <a className="badge" href={`/api/notes/${n.id}/download`} target="_blank" rel="noreferrer">Download ↗</a>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn-ghost" onClick={() => startEditNote(n)}>Edit</button>
              <button className="btn-danger" onClick={() => deleteNote(n.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
