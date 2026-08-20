import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute({ children, roles }) {
  const { session } = useAuth();
  const location = useLocation();

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && !session.user.roles.some((r) => roles.includes(r))) {
    return <Navigate to="/acces-interdit" replace />;
  }

  return children;
}