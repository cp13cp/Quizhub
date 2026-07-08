import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signup(form);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-card">
      <h1>Create account</h1>
      <p className="muted">Join QuizHub</p>
      <form onSubmit={submit}>
        <label>Name
          <input value={form.name} onChange={set('name')} required />
        </label>
        <label>Email
          <input type="email" value={form.email} onChange={set('email')} required />
        </label>
        <label>Password
          <input type="password" value={form.password} onChange={set('password')} required minLength={4} />
        </label>
        <label>Account type
          <select value={form.role} onChange={set('role')}>
            <option value="user">User (take quizzes)</option>
            <option value="admin">Admin (upload questions)</option>
          </select>
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn" disabled={busy}>{busy ? 'Creating…' : 'Sign up'}</button>
      </form>
      <p className="muted">Already have an account? <Link to="/login">Log in</Link></p>
    </div>
  );
}
