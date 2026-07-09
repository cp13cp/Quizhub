const { MongoClient } = require('mongodb');
const { randomUUID } = require('crypto');

const uri = process.env.MONGO_URI || 'mongodb+srv://singhchandrapal13_db_user:FxG9gC7GBWtE9oMg@cluster0.bafk1sb.mongodb.net/quiz_app';
let client;
let database;
let connectingPromise;

function normalizeDoc(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { ...rest, id: rest.id || _id?.toString() };
}

function normalizeDocs(docs) {
  return docs.map(normalizeDoc);
}

async function connect() {
  if (database) return database;
  if (!connectingPromise) {
    connectingPromise = (async () => {
      client = new MongoClient(uri);
      await client.connect();
      const parsed = new URL(uri);
      const dbName = parsed.pathname.replace(/^\/+/, '') || 'quiz_app';
      database = client.db(dbName);

      const collections = new Set((await database.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
      for (const name of ['users', 'question_sets', 'questions', 'submissions', 'notes']) {
        if (!collections.has(name)) {
          await database.createCollection(name);
        }
      }

      await database.collection('users').createIndex({ email: 1 }, { unique: true });
      await database.collection('users').createIndex({ id: 1 }, { unique: true });
      await database.collection('question_sets').createIndex({ id: 1 }, { unique: true });
      await database.collection('questions').createIndex({ question_set_id: 1, position: 1, id: 1 });
      await database.collection('notes').createIndex({ id: 1 }, { unique: true });
      await database.collection('submissions').createIndex({ id: 1 }, { unique: true });
      await database.collection('submissions').createIndex({ user_id: 1, submitted_at: -1 });
      return database;
    })();
  }

  return connectingPromise;
}

function createId() {
  return randomUUID();
}

function makeTimestamp() {
  return new Date().toISOString();
}

class PreparedStatement {
  constructor(sql) {
    this.sql = sql.trim();
    this.lower = sql.toLowerCase();
  }

  async get(...params) {
    const db = await connect();
    const sql = this.lower;

    if (sql.startsWith('select id from users where email = ?')) {
      const row = await db.collection('users').findOne({ email: params[0] }, { projection: { _id: 0, id: 1 } });
      return normalizeDoc(row);
    }

    if (sql.startsWith('select * from users where email = ?')) {
      const row = await db.collection('users').findOne({ email: params[0] });
      return normalizeDoc(row);
    }

    if (sql.startsWith('select id, name, email, role from users where id = ?')) {
      const row = await db.collection('users').findOne({ id: params[0] }, { projection: { _id: 0, id: 1, name: 1, email: 1, role: 1 } });
      return normalizeDoc(row);
    }

    if (sql.startsWith('select * from question_sets where id = ?')) {
      const row = await db.collection('question_sets').findOne({ id: params[0] });
      return normalizeDoc(row);
    }

    if (sql.startsWith('select * from questions where question_set_id = ? order by position, id')) {
      const rows = await db.collection('questions').find({ question_set_id: params[0] }).sort({ position: 1, id: 1 }).toArray();
      return normalizeDocs(rows);
    }

    if (sql.startsWith('select * from notes where id = ?')) {
      const row = await db.collection('notes').findOne({ id: params[0] });
      return normalizeDoc(row);
    }

    if (sql.startsWith('select * from submissions where id = ?')) {
      const row = await db.collection('submissions').findOne({ id: params[0] });
      return normalizeDoc(row);
    }

    if (sql.includes('from submissions s') && sql.includes('where s.id = ? and s.user_id = ?')) {
      const row = await db.collection('submissions').findOne({ id: params[0], user_id: params[1] });
      return normalizeDoc(row);
    }

    if (sql.includes('from submissions s') && sql.includes('where s.user_id = ?')) {
      const rows = await db.collection('submissions').find({ user_id: params[0] }).sort({ submitted_at: -1 }).toArray();
      return normalizeDocs(rows);
    }

    if (sql.includes('from submissions s') && sql.includes('where s.id = ?')) {
      const row = await db.collection('submissions').findOne({ id: params[0] });
      return normalizeDoc(row);
    }

    if (sql.includes('from notes n join users u on u.id = n.uploaded_by') && sql.includes('order by n.created_at desc')) {
      const rows = await db.collection('notes').find({}).sort({ created_at: -1 }).toArray();
      const users = await db.collection('users').find({ id: { $in: rows.map((row) => row.uploaded_by).filter(Boolean) } }).toArray();
      const userMap = new Map(users.map((user) => [user.id, user]));
      return normalizeDocs(rows).map((row) => ({ ...row, uploader_name: userMap.get(row.uploaded_by)?.name || null }));
    }

    if (sql.includes('from question_sets qs left join users u on u.id = qs.created_by') && sql.includes('order by qs.created_at desc')) {
      const rows = await db.collection('question_sets').find({}).sort({ created_at: -1 }).toArray();
      const users = await db.collection('users').find({ id: { $in: rows.map((row) => row.created_by).filter(Boolean) } }).toArray();
      const userMap = new Map(users.map((user) => [user.id, user]));
      const questions = await db.collection('questions').find({ question_set_id: { $in: rows.map((row) => row.id) } }).toArray();
      const counts = Object.fromEntries(rows.map((row) => [row.id, questions.filter((q) => q.question_set_id === row.id).length]));
      return normalizeDocs(rows).map((row) => ({
        ...row,
        creator_name: userMap.get(row.created_by)?.name || null,
        question_count: counts[row.id] || 0,
      }));
    }

    if (sql.includes('from submissions s') && sql.includes('join question_sets qs') && sql.includes('join users u')) {
      const rows = await db.collection('submissions').find({}).sort({ submitted_at: -1 }).toArray();
      const questionSets = await db.collection('question_sets').find({ id: { $in: rows.map((row) => row.question_set_id).filter(Boolean) } }).toArray();
      const users = await db.collection('users').find({ id: { $in: rows.map((row) => row.user_id).filter(Boolean) } }).toArray();
      const setMap = new Map(questionSets.map((set) => [set.id, set]));
      const userMap = new Map(users.map((user) => [user.id, user]));
      return normalizeDocs(rows).map((row) => ({
        ...row,
        question_set_title: setMap.get(row.question_set_id)?.title || null,
        max_score: setMap.get(row.question_set_id)?.max_score || null,
        user_name: userMap.get(row.user_id)?.name || null,
        user_email: userMap.get(row.user_id)?.email || null,
      }));
    }

    if (sql.includes('from submissions s') && sql.includes('join question_sets qs') && !sql.includes('join users u')) {
      const rows = await db.collection('submissions').find({}).sort({ submitted_at: -1 }).toArray();
      const questionSets = await db.collection('question_sets').find({ id: { $in: rows.map((row) => row.question_set_id).filter(Boolean) } }).toArray();
      const setMap = new Map(questionSets.map((set) => [set.id, set]));
      return normalizeDocs(rows).map((row) => ({
        ...row,
        question_set_title: setMap.get(row.question_set_id)?.title || null,
        max_score: setMap.get(row.question_set_id)?.max_score || null,
      }));
    }

    throw new Error(`Unsupported query: ${this.sql}`);
  }

  async all(...params) {
    return this.get(...params);
  }

  async run(...params) {
    const db = await connect();

    if (this.lower.startsWith('insert into users')) {
      const columns = this.sql.match(/\(([^)]+)\)\s*values/i)?.[1].split(',').map((c) => c.trim()) || [];
      const values = params;
      const doc = { ...Object.fromEntries(columns.map((column, index) => [column, values[index]])) };
      doc.id = doc.id || createId();
      doc.created_at = doc.created_at || makeTimestamp();
      await db.collection('users').insertOne(doc);
      return { lastInsertRowid: doc.id };
    }

    if (this.lower.startsWith('insert into question_sets')) {
      const columns = this.sql.match(/\(([^)]+)\)\s*values/i)?.[1].split(',').map((c) => c.trim()) || [];
      const values = params;
      const doc = { ...Object.fromEntries(columns.map((column, index) => [column, values[index]])) };
      doc.id = doc.id || createId();
      doc.created_at = doc.created_at || makeTimestamp();
      await db.collection('question_sets').insertOne(doc);
      return { lastInsertRowid: doc.id };
    }

    if (this.lower.startsWith('insert into questions')) {
      const columns = this.sql.match(/\(([^)]+)\)\s*values/i)?.[1].split(',').map((c) => c.trim()) || [];
      const values = params;
      const doc = { ...Object.fromEntries(columns.map((column, index) => [column, values[index]])) };
      doc.id = doc.id || createId();
      await db.collection('questions').insertOne(doc);
      return { lastInsertRowid: doc.id };
    }

    if (this.lower.startsWith('insert into notes')) {
      const columns = this.sql.match(/\(([^)]+)\)\s*values/i)?.[1].split(',').map((c) => c.trim()) || [];
      const values = params;
      const doc = { ...Object.fromEntries(columns.map((column, index) => [column, values[index]])) };
      doc.id = doc.id || createId();
      doc.created_at = doc.created_at || makeTimestamp();
      await db.collection('notes').insertOne(doc);
      return { lastInsertRowid: doc.id };
    }

    if (this.lower.startsWith('insert into submissions')) {
      const columns = this.sql.match(/\(([^)]+)\)\s*values/i)?.[1].split(',').map((c) => c.trim()) || [];
      const values = params;
      const doc = { ...Object.fromEntries(columns.map((column, index) => [column, values[index]])) };
      doc.id = doc.id || createId();
      doc.submitted_at = doc.submitted_at || makeTimestamp();
      if (!doc.graded_at) doc.graded_at = null;
      await db.collection('submissions').insertOne(doc);
      return { lastInsertRowid: doc.id };
    }

    if (this.lower.startsWith('delete from submissions where question_set_id = ?')) {
      const result = await db.collection('submissions').deleteMany({ question_set_id: params[0] });
      return { changes: result.deletedCount };
    }

    if (this.lower.startsWith('delete from questions where question_set_id = ?')) {
      const result = await db.collection('questions').deleteMany({ question_set_id: params[0] });
      return { changes: result.deletedCount };
    }

    if (this.lower.startsWith('delete from question_sets where id = ?')) {
      const result = await db.collection('question_sets').deleteOne({ id: params[0] });
      return { changes: result.deletedCount };
    }

    if (this.lower.startsWith('delete from notes where id = ?')) {
      const result = await db.collection('notes').deleteOne({ id: params[0] });
      return { changes: result.deletedCount };
    }

    if (this.lower.startsWith('update question_sets set')) {
      const [, assignmentsPart] = this.sql.match(/update question_sets set (.+) where id = \?/i) || [];
      const assignments = assignmentsPart.split(',').map((item) => item.trim());
      const updateDoc = {};
      assignments.forEach((assignment, index) => {
        const m = assignment.match(/([a-z_]+) = \?/i);
        if (m) {
          updateDoc[m[1]] = params[index];
        }
      });
      updateDoc.updated_at = makeTimestamp();
      await db.collection('question_sets').updateOne({ id: params[assignments.length] }, { $set: updateDoc });
      return { changes: 1 };
    }

    if (this.lower.startsWith('update notes set')) {
      const [, assignmentsPart] = this.sql.match(/update notes set (.+) where id = \?/i) || [];
      const assignments = assignmentsPart.split(',').map((item) => item.trim());
      const updateDoc = {};
      assignments.forEach((assignment, index) => {
        const m = assignment.match(/([a-z_]+) = \?/i);
        if (m) {
          updateDoc[m[1]] = params[index];
        }
      });
      updateDoc.updated_at = makeTimestamp();
      await db.collection('notes').updateOne({ id: params[assignments.length] }, { $set: updateDoc });
      return { changes: 1 };
    }

    if (this.lower.startsWith('update submissions')) {
      const updateDoc = { score: params[0], feedback: params[1], status: 'graded', graded_at: makeTimestamp() };
      await db.collection('submissions').updateOne({ id: params[2] }, { $set: updateDoc });
      return { changes: 1 };
    }

    throw new Error(`Unsupported statement: ${this.sql}`);
  }
}

async function init() {
  await connect();
}

const db = {
  prepare(sql) {
    return new PreparedStatement(sql);
  },
  exec() {},
  async close() {
    if (client) await client.close();
    client = null;
    database = null;
    connectingPromise = null;
  },
};

init().catch((error) => console.error('MongoDB connection failed:', error.message));

module.exports = db;
