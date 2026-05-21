import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, ArrowRightLeft, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Layout from '@/components/Layout';

export default function Profile() {
  const { user, logout, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-2 border-emerald-400 border-t-transparent rounded-full" />
        </div>
      </Layout>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <p className="text-slate-400">Please sign in to view your profile.</p>
        </div>
      </Layout>
    );
  }

  const initials = (user.email || 'U').charAt(0).toUpperCase();
  const roleBadgeColor = user.role === 'admin'
    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
    : 'bg-amber-500/20 text-amber-400 border-amber-500/40';
  const roleLabel = user.role === 'admin' ? 'Tournament Admin' : 'Archer';

  const handleSwitchRole = () => {
    navigate('/role-select');
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-12">
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/50 p-8">
          {/* Avatar */}
          <div className="flex flex-col items-center mb-8">
            <div className="h-20 w-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center mb-4">
              <span className="text-3xl font-bold text-emerald-400">{initials}</span>
            </div>
            {user.name && (
              <h2 className="text-xl font-semibold text-white mb-1">{user.name}</h2>
            )}
            <p className="text-slate-400 text-sm">{user.email}</p>
          </div>

          {/* Role Badge */}
          <div className="flex items-center justify-center mb-8">
            <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium ${roleBadgeColor}`}>
              <User className="h-4 w-4" />
              {roleLabel}
            </span>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Button
              onClick={handleSwitchRole}
              className="w-full h-12 bg-slate-700 hover:bg-slate-600 text-white border border-slate-600"
            >
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              Switch Role
            </Button>

            <Button
              onClick={handleLogout}
              variant="ghost"
              className="w-full h-12 text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}