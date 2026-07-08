require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const db = require('./db');
const { signToken, requireAuth, requireAdmin } = require('./auth');
const { parseQuizText } = require('./quizParser');
const { extractPdfText } = require('./pdfText');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
});

const uploadMem = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
});

app.use('/uploads', express.static(uploadDir));

const notesAllowed = new Set([
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const notesUpload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (notesAllowed.has(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF, TXT and Word documents are allowed for notes'));
  },
});

app.post('/api/parse-pdf', requireAuth, requireAdmin, uploadMem.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'A PDF file is required' });
  try {
    const text = await extractPdfText(req.file.buffer);
    const questions = parseQuizText(text);
    if (questions.length === 0) {
      return res.status(422).json({
        error:
          'Could not detect any questions. Make sure the PDF has numbered questions (1., 2.), ' +
          'lettered options (A), B), C)) and an "Answer: B" line for each.',
        raw_text: text,
      });
    }
    res.json({ questions, count: questions.length });
  } catch (e) {
    res.status(400).json({ error: 'Failed to read PDF: ' + e.message });
  }
});

app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const exists = await db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (exists) return res.status(409).json({ error: 'Email already registered' });

  const hash = bcrypt.hashSync(password, 10);
  const finalRole = role === 'admin' ? 'admin' : 'user';
  const info = await db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(
    name.trim(), cleanEmail, hash, finalRole
  );

  const user = { id: info.lastInsertRowid, name: name.trim(), email: cleanEmail, role: finalRole };
  res.json({ token: signToken(user), user });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const cleanEmail = String(email).trim().toLowerCase();
  const row = await db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const user = { id: row.id, name: row.name, email: row.email, role: row.role };
  res.json({ token: signToken(user), user });
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  const row = await db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(req.user.id);
  if (!row) return res.status(404).json({ error: 'User not found' });
  res.json({ user: row });
});

function parseQuestions(raw) {
  if (!raw) return [];
  let arr = raw;
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw); } catch { throw new Error('questions must be valid JSON'); }
  }
  if (!Array.isArray(arr)) throw new Error('questions must be an array');
  return arr.map((q, i) => {
    const text = (q.question_text || '').trim();
    const options = Array.isArray(q.options) ? q.options.map((o) => String(o).trim()).filter(Boolean) : [];
    const correct = Number(q.correct_index);
    if (!text) throw new Error(`Question ${i + 1}: text is required`);
    if (options.length < 2) throw new Error(`Question ${i + 1}: at least 2 options required`);
    if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) {
      throw new Error(`Question ${i + 1}: a valid correct option must be selected`);
    }
    return { question_text: text, options, correct_index: correct, position: i };
  });
}

app.post('/api/question-sets', requireAuth, requireAdmin, upload.single('pdf'), async (req, res) => {
  const { title, description, text_content, max_score, category } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title is required' });

  const questions = parseQuestions(req.body?.questions);
  const pdfPath = req.file ? `/uploads/${req.file.filename}` : null;

  const info = await db.prepare(
    `INSERT INTO question_sets (title, description, text_content, pdf_path, category, max_score, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(title.trim(), description || null, text_content || null, pdfPath, category || null, Number(max_score) || 100, req.user.id);

  const setId = info.lastInsertRowid;
  for (const q of questions) {
    await db.prepare(
      `INSERT INTO questions (question_set_id, question_text, options_json, correct_index, position)
       VALUES (?, ?, ?, ?, ?)`
    ).run(setId, q.question_text, JSON.stringify(q.options), q.correct_index, q.position);
  }

  const row = await db.prepare('SELECT * FROM question_sets WHERE id = ?').get(setId);
  res.json({ ...row, question_count: questions.length });
});

app.patch('/api/question-sets/:id', requireAuth, requireAdmin, upload.single('pdf'), async (req, res) => {
  const id = req.params.id;
  const { title, description, text_content, max_score, category } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title is required' });

  const existing = await db.prepare('SELECT * FROM question_sets WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  let pdfPath = existing.pdf_path;
  if (req.file) {
    if (pdfPath) {
      const file = path.join(uploadDir, path.basename(pdfPath));
      fs.existsSync(file) && fs.unlinkSync(file);
    }
    pdfPath = `/uploads/${req.file.filename}`;
  }

  await db.prepare(
    `UPDATE question_sets SET title = ?, description = ?, text_content = ?, pdf_path = ?, category = ?, max_score = ? WHERE id = ?`
  ).run(title.trim(), description || null, text_content || null, pdfPath, category || null, Number(max_score) || 100, id);

  const questions = parseQuestions(req.body?.questions);
  await db.prepare('DELETE FROM questions WHERE question_set_id = ?').run(id);
  for (const q of questions) {
    await db.prepare(
      `INSERT INTO questions (question_set_id, question_text, options_json, correct_index, position)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, q.question_text, JSON.stringify(q.options), q.correct_index, q.position);
  }

  const row = await db.prepare('SELECT * FROM question_sets WHERE id = ?').get(id);
  res.json({ ...row, question_count: questions.length });
});

app.get('/api/question-sets', requireAuth, async (_req, res) => {
  const rows = await db.prepare(
    `SELECT qs.*, u.name AS creator_name,
              (SELECT COUNT(*) FROM questions q WHERE q.question_set_id = qs.id) AS question_count
       FROM question_sets qs
       LEFT JOIN users u ON u.id = qs.created_by
       ORDER BY qs.created_at DESC`
  ).all();
  res.json(rows);
});

app.get('/api/question-sets/:id', requireAuth, async (req, res) => {
  const row = await db.prepare('SELECT * FROM question_sets WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const isAdmin = req.user.role === 'admin';
  const questionsRaw = await db.prepare('SELECT * FROM questions WHERE question_set_id = ? ORDER BY position, id').all(req.params.id);
  const questions = questionsRaw.map((q) => {
    const base = {
      id: q.id,
      question_text: q.question_text,
      options: JSON.parse(q.options_json),
      position: q.position,
    };
    return isAdmin ? { ...base, correct_index: q.correct_index } : base;
  });

  res.json({ ...row, questions });
});

app.delete('/api/question-sets/:id', requireAuth, requireAdmin, async (req, res) => {
  const row = await db.prepare('SELECT * FROM question_sets WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  await db.prepare('DELETE FROM submissions WHERE question_set_id = ?').run(req.params.id);
  await db.prepare('DELETE FROM questions WHERE question_set_id = ?').run(req.params.id);
  await db.prepare('DELETE FROM question_sets WHERE id = ?').run(req.params.id);
  if (row.pdf_path) {
    const file = path.join(uploadDir, path.basename(row.pdf_path));
    fs.existsSync(file) && fs.unlinkSync(file);
  }
  res.json({ ok: true });
});

app.post('/api/notes', requireAuth, requireAdmin, notesUpload.single('file'), async (req, res) => {
  const { title, description } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title is required' });
  if (!req.file) return res.status(400).json({ error: 'file is required' });

  const filePath = `/uploads/${req.file.filename}`;
  const original_name = req.file.originalname || req.file.filename;
  const info = await db.prepare(
    'INSERT INTO notes (title, description, file_path, uploaded_by, original_name) VALUES (?, ?, ?, ?, ?)'
  ).run(title.trim(), description || null, filePath, req.user.id, original_name);

  const row = await db.prepare('SELECT * FROM notes WHERE id = ?').get(info.lastInsertRowid);
  res.json(row);
});

app.get('/api/notes', requireAuth, async (_req, res) => {
  const rows = await db.prepare('SELECT n.*, u.name AS uploader_name FROM notes n JOIN users u ON u.id = n.uploaded_by ORDER BY n.created_at DESC').all();
  res.json(rows);
});

app.get('/api/notes/:id', requireAuth, async (req, res) => {
  const row = await db.prepare('SELECT n.*, u.name AS uploader_name FROM notes n JOIN users u ON u.id = n.uploaded_by WHERE n.id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

app.patch('/api/notes/:id', requireAuth, requireAdmin, notesUpload.single('file'), async (req, res) => {
  const id = req.params.id;
  const note = await db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
  if (!note) return res.status(404).json({ error: 'Not found' });

  const { title, description } = req.body || {};
  let filePath = note.file_path;
  let original_name = note.original_name || null;

  if (req.file) {
    if (note.file_path) {
      const old = path.join(uploadDir, path.basename(note.file_path));
      fs.existsSync(old) && fs.unlinkSync(old);
    }
    filePath = `/uploads/${req.file.filename}`;
    original_name = req.file.originalname || req.file.filename;
  }

  await db.prepare('UPDATE notes SET title = ?, description = ?, file_path = ?, original_name = ? WHERE id = ?').run(
    title || note.title,
    description || note.description,
    filePath,
    original_name,
    id
  );

  const row = await db.prepare('SELECT n.*, u.name AS uploader_name FROM notes n JOIN users u ON u.id = n.uploaded_by WHERE n.id = ?').get(id);
  res.json(row);
});

app.delete('/api/notes/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = req.params.id;
  const note = await db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
  if (!note) return res.status(404).json({ error: 'Not found' });
  if (note.file_path) {
    const file = path.join(uploadDir, path.basename(note.file_path));
    fs.existsSync(file) && fs.unlinkSync(file);
  }
  await db.prepare('DELETE FROM notes WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.get('/api/notes/:id/download', requireAuth, async (req, res) => {
  const id = req.params.id;
  const note = await db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
  if (!note) return res.status(404).json({ error: 'Not found' });
  const name = note.original_name || 'download';
  const file = path.join(uploadDir, path.basename(note.file_path || ''));
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'File not found' });
  res.download(file, name);
});

app.post('/api/submissions', requireAuth, async (req, res) => {
  const { question_set_id, answer_text, answers } = req.body || {};
  if (!question_set_id) return res.status(400).json({ error: 'question_set_id is required' });

  const qs = await db.prepare('SELECT * FROM question_sets WHERE id = ?').get(question_set_id);
  if (!qs) return res.status(404).json({ error: 'Question set not found' });

  const questions = await db.prepare('SELECT id, question_text, options_json, correct_index FROM questions WHERE question_set_id = ?').all(question_set_id);

  if (questions.length > 0) {
    const picked = answers && typeof answers === 'object' ? answers : {};
    let correct = 0;
    const details = questions.map((q) => {
      const selected_index = Number(picked[q.id]);
      const isCorrect = selected_index === q.correct_index;
      if (isCorrect) correct++;
      return {
        question_id: q.id,
        question_text: q.question_text,
        options: JSON.parse(q.options_json),
        correct_index: q.correct_index,
        selected_index: Number.isInteger(selected_index) ? selected_index : null,
        correct: isCorrect,
      };
    });

    const total = questions.length;
    const score = Math.round((correct / total) * qs.max_score);
    const feedback = `${correct} / ${total} correct`;

    const info = await db.prepare(
      `INSERT INTO submissions
         (question_set_id, user_id, answers_json, score, status, feedback, graded_at)
       VALUES (?, ?, ?, ?, 'graded', ?, datetime('now'))`
    ).run(question_set_id, req.user.id, JSON.stringify(picked), score, feedback);

    const row = await db.prepare('SELECT * FROM submissions WHERE id = ?').get(info.lastInsertRowid);
    return res.json({ ...row, correct, total, max_score: qs.max_score, details });
  }

  const info = await db.prepare(
    `INSERT INTO submissions (question_set_id, user_id, answer_text, status)
     VALUES (?, ?, ?, 'pending')`
  ).run(question_set_id, req.user.id, answer_text || null);

  const row = await db.prepare('SELECT * FROM submissions WHERE id = ?').get(info.lastInsertRowid);
  res.json(row);
});

app.get('/api/submissions/mine', requireAuth, async (req, res) => {
  const rows = await db.prepare(
    `SELECT s.*, qs.title AS question_set_title, qs.max_score
       FROM submissions s
       JOIN question_sets qs ON qs.id = s.question_set_id
       WHERE s.user_id = ?
       ORDER BY s.submitted_at DESC`
  ).all(req.user.id);
  res.json(rows);
});

app.get('/api/submissions/:id', requireAuth, async (req, res) => {
  const sub = await db.prepare(
    `SELECT s.*, qs.title AS question_set_title, qs.max_score
       FROM submissions s
       JOIN question_sets qs ON qs.id = s.question_set_id
       WHERE s.id = ? AND s.user_id = ?`
  ).get(req.params.id, req.user.id);

  if (!sub) return res.status(404).json({ error: 'Submission not found' });

  if (sub.status === 'graded' && sub.answers_json) {
    const questions = await db.prepare('SELECT id, question_text, options_json, correct_index FROM questions WHERE question_set_id = ?').all(sub.question_set_id);
    const picked = JSON.parse(sub.answers_json || '{}');
    const details = questions.map((q) => {
      const selected_index = Number(picked[q.id]);
      return {
        question_id: q.id,
        question_text: q.question_text,
        options: JSON.parse(q.options_json),
        correct_index: q.correct_index,
        selected_index: Number.isInteger(selected_index) ? selected_index : null,
        correct: selected_index === q.correct_index,
      };
    });
    return res.json({ ...sub, details });
  }

  res.json(sub);
});

app.get('/api/submissions', requireAuth, requireAdmin, async (_req, res) => {
  const rows = await db.prepare(
    `SELECT s.*, qs.title AS question_set_title, qs.max_score, u.name AS user_name, u.email AS user_email
       FROM submissions s
       JOIN question_sets qs ON qs.id = s.question_set_id
       JOIN users u ON u.id = s.user_id
       ORDER BY s.submitted_at DESC`
  ).all();
  res.json(rows);
});

app.get('/api/submissions/:id/detail', requireAuth, requireAdmin, async (req, res) => {
  const sub = await db.prepare(
    `SELECT s.*, qs.title AS question_set_title, qs.max_score, u.name AS user_name, u.email AS user_email
       FROM submissions s
       JOIN question_sets qs ON qs.id = s.question_set_id
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`
  ).get(req.params.id);

  if (!sub) return res.status(404).json({ error: 'Submission not found' });

  const details = [];
  if (sub.answers_json && sub.question_set_id) {
    const questions = await db.prepare('SELECT id, question_text, options_json, correct_index FROM questions WHERE question_set_id = ?').all(sub.question_set_id);
    const picked = JSON.parse(sub.answers_json || '{}');
    for (const q of questions) {
      const selected_index = Number.isInteger(picked[q.id]) ? Number(picked[q.id]) : null;
      details.push({
        question_id: q.id,
        question_text: q.question_text,
        options: JSON.parse(q.options_json),
        correct_index: q.correct_index,
        selected_index,
        correct: selected_index === q.correct_index,
      });
    }
  }

  res.json({ ...sub, details, answer_text: sub.answer_text });
});

app.patch('/api/submissions/:id/grade', requireAuth, requireAdmin, async (req, res) => {
  const { score, feedback } = req.body || {};
  const sub = await db.prepare('SELECT * FROM submissions WHERE id = ?').get(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Submission not found' });

  await db.prepare(
    `UPDATE submissions
     SET score = ?, feedback = ?, status = 'graded', graded_at = datetime('now')
     WHERE id = ?`
  ).run(Number(score), feedback || null, req.params.id);

  const row = await db.prepare('SELECT * FROM submissions WHERE id = ?').get(req.params.id);
  res.json(row);
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(400).json({ error: err.message || 'Something went wrong' });
});

app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
