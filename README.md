# QuizHub

A website where **admins** upload question sets (as text and/or PDF) and **users** submit answers and track their results history. Admins manually score submissions.

## Stack
- **Backend:** Node.js + Express + SQLite (`better-sqlite3`), JWT auth, `multer` for PDF uploads
- **Frontend:** React + Vite + React Router

## Features
- Signup / login with roles (`user` or `admin`)
- Admin: upload question sets (title, description, question text, PDF), delete sets, view all submissions and record scores + feedback
- User: browse question sets, read question text / view the PDF, submit answers, and see a history of results with scores

## Running locally

Open **two terminals**.

**1. Backend (port 4000):**
```bash
cd server
npm install
npm start
```

**2. Frontend (port 5173):**
```bash
cd client
npm install
npm run dev
```

Then open http://localhost:5173

The Vite dev server proxies `/api` and `/uploads` to the backend, so no CORS config is needed in development.

## Uploading questions as a PDF (auto-quiz)

An admin can upload a PDF and have it converted into a clickable, auto-graded quiz.

On the **Create a new quiz** page, use **"📄 Import questions from a PDF"**. The PDF should be formatted like this:

```
1. What is the capital of Japan?
A) Beijing
B) Seoul
C) Tokyo
D) Bangkok
Answer: C

2) Which is a prime number?
A) 9
B) 15
C) 7
Answer: C
```

Rules the parser understands:
- Questions start with a number and `.` or `)` — e.g. `1.` or `12)`
- Options start with a letter `A`–`H` and `.` or `)` (parentheses optional) — one per line or several on one line
- The correct answer is a line like `Answer: B`, `Ans - C`, or `Correct: 2` (letter or 1-based number)

After importing, the extracted questions fill the builder so you can **review and fix** anything before creating the quiz. PDF text extraction uses `pdfjs-dist`.

## First steps
1. Sign up an **admin** account (choose "Admin" on the signup form).
2. As admin, upload a question set with some text and/or a PDF.
3. Sign up a **user** account (in another browser / incognito window).
4. As the user, open a set, submit answers, then check **My Results**.
5. Back as admin, open **Submissions**, record a score — it appears in the user's results.

## Notes
- The SQLite database file `server/data.db` is created automatically on first run.
- Uploaded PDFs are stored in `server/uploads/`.
- For production, set a strong `JWT_SECRET` environment variable and put the API behind HTTPS. The "Admin" self-signup option is convenient for development — lock it down before deploying.
- On Render, the app directory is not guaranteed to persist across restarts or deploys. Use a persistent disk or set `DB_PATH` to a mounted persistent location so `data.db` is not lost.
