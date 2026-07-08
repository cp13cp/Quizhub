import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import UserDashboard from './pages/UserDashboard.jsx';
import QuestionSetView from './pages/QuestionSetView.jsx';
import History from './pages/History.jsx';
import ReviewSubmission from './pages/ReviewSubmission.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import AdminSubmissions from './pages/AdminSubmissions.jsx';

function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <nav className="navbar">
      <Link to="/" className="brand">QuizHub</Link>
      <div className="nav-links">
        {user.role === 'admin' ? (
          <>
            <Link to="/admin">Question Sets</Link>
            <Link to="/admin/submissions">Submissions</Link>
          </>
        ) : (
          <>
            <Link to="/">Available</Link>
            <Link to="/history">My Results</Link>
          </>
        )}
        <span className="nav-user">{user.name} · {user.role}</span>
        <button className="btn-ghost" onClick={() => { logout(); navigate('/login'); }}>
          Logout
        </button>
      </div>
    </nav>
  );
}

function Protected({ children, role }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return children;
}

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <div className="center">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'admin' ? '/admin' : '/dashboard'} replace />;
}

export default function App() {
  return (
    <>
      <NavBar />
      <main className="container">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/" element={<Home />} />

          <Route path="/dashboard" element={<Protected role="user"><UserDashboard /></Protected>} />
          <Route path="/sets/:id" element={<Protected role="user"><QuestionSetView /></Protected>} />
          <Route path="/history" element={<Protected role="user"><History /></Protected>} />
          <Route path="/review/:id" element={<Protected role="user"><ReviewSubmission /></Protected>} />

          <Route path="/admin" element={<Protected role="admin"><AdminDashboard /></Protected>} />
          <Route path="/admin/submissions" element={<Protected role="admin"><AdminSubmissions /></Protected>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
