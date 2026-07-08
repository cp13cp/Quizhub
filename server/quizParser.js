// Converts raw text (extracted from a PDF) into structured MCQ questions.
//
// Expected PDF format (flexible, but this works best):
//   1. What is 2 + 2?
//   A) 3
//   B) 4
//   C) 5
//   Answer: B
//
//   2) Capital of France?
//   (A) Berlin
//   (B) Paris
//   Ans: B
//
// Rules it understands:
//   - A question starts with a number then . or )   e.g. "1." or "12)"
//   - An option starts with a letter A–H then . or ) (optionally wrapped in parens)
//     Options may be one-per-line OR several on one line ("A) 3  B) 4  C) 5")
//   - The correct answer is a line like "Answer: B", "Ans - C", "Correct: 2"
//     (letter A–H or a 1-based number). If missing, correct defaults to option A.

const Q_START = /^\s*(?:Q\s*)?(\d+)\s*[.)]\s*(.*)$/i;
const ANSWER = /^\s*(?:answer|ans|correct(?:\s*answer)?)\s*[:\-.]?\s*\(?\s*([A-Ha-h1-9])\s*\)?(?:[\s\.:)]|$).*$/i;
// Option markers anywhere on a line: "A)", "A.", "A-", "A:" or "(A)" — letters A–H only to limit false hits.
const OPT_MARKERS = /(?:^|\s)\(?([A-Ha-h])[.)\-:\s]\s*/g;

// Returns { lead, options } — `lead` is any text before the first option marker
// (question text when options are inline), or null if the line has no option markers.
function splitOptionsOnLine(line) {
  const markers = [...line.matchAll(OPT_MARKERS)];
  if (markers.length === 0) return null;
  const lead = line.slice(0, markers[0].index).trim();
  const opts = [];
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].index + markers[i][0].length;
    const end = i + 1 < markers.length ? markers[i + 1].index : line.length;
    const text = line.slice(start, end).trim();
    if (text) opts.push(text);
  }
  return { lead, options: opts };
}

function answerToIndex(key, optionCount) {
  const k = key.toUpperCase();
  const idx = /[1-9]/.test(k) ? parseInt(k, 10) - 1 : k.charCodeAt(0) - 65;
  return idx >= 0 && idx < optionCount ? idx : 0;
}

function parseQuizText(rawText) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const questions = [];
  let cur = null;

  const commit = () => {
    if (cur && cur.question_text && cur.options.length >= 2) {
      // Clamp / default the correct answer
      if (!Number.isInteger(cur.correct_index) || cur.correct_index >= cur.options.length) {
        cur.correct_index = 0;
      }
      questions.push({
        question_text: cur.question_text,
        options: cur.options,
        correct_index: cur.correct_index,
      });
    }
  };

  for (const line of lines) {
    // 1) Answer line (only meaningful while inside a question)
    const ans = line.match(ANSWER);
    if (ans && cur && cur.options.length) {
      cur.correct_index = answerToIndex(ans[1], cur.options.length);
      continue;
    }

    // 2) New question — must start with a number+delimiter and NOT look like an option
    const q = line.match(Q_START);
    if (q && !/^\s*\(?[A-Ha-h][.)]/.test(line)) {
      commit();
      const rest = q[2].trim();
      cur = { question_text: rest, options: [], correct_index: 0 };
      // Options may sit inline on the same line ("Pick one A) x B) y C) z")
      const inline = splitOptionsOnLine(rest);
      if (inline && inline.options.length >= 2) {
        cur.question_text = inline.lead;
        cur.options.push(...inline.options);
      }
      continue;
    }

    if (!cur) continue; // preamble before the first question — ignore

    // 3) Option(s) on this line
    const parsed = splitOptionsOnLine(line);
    if (parsed && parsed.options.length) {
      // stray text before the first option = question continuation
      if (parsed.lead && cur.options.length === 0) cur.question_text += ' ' + parsed.lead;
      cur.options.push(...parsed.options);
      continue;
    }

    // 4) Continuation of the question text or the last option
    if (cur.options.length === 0) {
      cur.question_text += ' ' + line;
    } else {
      cur.options[cur.options.length - 1] += ' ' + line;
    }
  }
  commit();

  return questions;
}

module.exports = { parseQuizText };
