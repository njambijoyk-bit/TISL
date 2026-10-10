import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../../_shared/store/index';
import LoadingSpinner from '../../../_shared/components/layout/LoadingSpinner';
import authAPI from '../../../_shared/api/auth';
import toast from 'react-hot-toast';
import { isStaff } from '../../../_shared/lib/roles';

export default function OAuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuthStore();

  useEffect(() => {
    const handleCallback = async () => {
      const token   = searchParams.get('token');   // only from a server with cookie sessions switched off
      const ok      = searchParams.get('ok');      // the sign-in is already in a protected cookie that came with the redirect
      const error   = searchParams.get('error');
      const message = searchParams.get('message');

      if (error) {
        toast.error(message ? decodeURIComponent(message) : 'OAuth login failed');
        navigate('/login');
        return;
      }

      if (!token && !ok) {
        toast.error('Invalid OAuth callback');
        navigate('/login');
        return;
      }

      try {
        // With a cookie there is nothing to store: /me is answered for the cookie. Without one (cookie sessions off) keep the code so the request is authenticated.
        if (token) localStorage.setItem('token', token);

        const response = await authAPI.me();
        // /me returns { user, customer }
        const user     = response.user;
        const customer = response.customer ?? null;

        if (!user?.email) {
          throw new Error('Invalid user data received');
        }

        // Must match store signature: login(user, customer, token, access, csrf)
        login(user, customer, token, response.access ?? null, response.csrf ?? null);

        toast.success(`Welcome back, ${user.name}!`);

        const isAdmin = isStaff(user, response.access);
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