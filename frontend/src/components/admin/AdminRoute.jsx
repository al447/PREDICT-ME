import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import useAdminAuthStore from '../../store/adminAuthStore';

const AdminRoute = ({ children }) => {
  const { admin, token, fetchMe, isLoading } = useAdminAuthStore();

  useEffect(() => {
    if (token) fetchMe();
  }, []);

  if (!token) return <Navigate to="/admin/login" replace />;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[var(--color-gold)]" />
      </div>
    );
  }

  if (!admin) return <Navigate to="/admin/login" replace />;

  return children;
};

export default AdminRoute;
