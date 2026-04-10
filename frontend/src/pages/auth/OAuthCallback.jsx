import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../store';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import authAPI from '../../api/auth';
import toast from 'react-hot-toast';

export default function OAuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuthStore();

  useEffect(() => {
    const handleCallback = async () => {
      const token   = searchParams.get('token');
      const error   = searchParams.get('error');
      const message = searchParams.get('message');

      if (error) {
        toast.error(message ? decodeURIComponent(message) : 'OAuth login failed');
        navigate('/login');
        return;
      }

      if (!token) {
        toast.error('Invalid OAuth callback');
        navigate('/login');
        return;
      }

      try {
        // Store token before calling /me so the request is authenticated
        localStorage.setItem('token', token);

        const response = await authAPI.me();
        // /me returns { user, customer }
        const user     = response.user;
        const customer = response.customer ?? null;

        if (!user?.email) {
          throw new Error('Invalid user data received');
        }

        // Must match store signature: login(user, customer, token)
        login(user, customer, token);

        toast.success(`Welcome back, ${user.name}!`);

        const isAdmin = ['admin', 'super_admin', 'manager', 'sales_rep'].includes(user.role);
        navigate(isAdmin ? '/admin' : '/');

      } catch (err) {
        console.error('OAuth callback error:', err);
        toast.error('Failed to complete login. Please try again.');
        localStorage.removeItem('token');
        navigate('/login');
      }
    };

    handleCallback();
  }, []);   // empty deps — only run once on mount

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <LoadingSpinner />
        <p className="mt-4 text-gray-600 dark:text-gray-400">Completing login…</p>
      </div>
    </div>
  );
}