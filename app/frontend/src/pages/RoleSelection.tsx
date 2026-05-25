import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getClient } from '@/lib/client';
import { Shield, Target } from 'lucide-react';

export default function RoleSelection() {
  const { user, loading, refreshRole } = useAuth();
  const navigate = useNavigate();
  const [selecting, setSelecting] = useState(false);
  const client = getClient();

  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      navigate('/', { replace: true });
    }
  }, [user, loading, navigate]);

  const handleSelectRole = async (role: 'admin' | 'archer') => {
    if (selecting) return;
    setSelecting(true);
    try {
      await client.apiCall.invoke({
        url: '/api/v1/roles/set',
        method: 'POST',
        data: { role },
      });
      await refreshRole();
      if (role === 'admin') {
        navigate('/', { replace: true });
      } else {
        navigate('/archer', { replace: true });
      }
    } catch (err) {
      console.error('Failed to set role:', err);
    } finally {
      setSelecting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0f172a' }}>
        <div className="animate-spin h-8 w-8 border-2 border-emerald-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0f172a' }}>
        <p className="text-slate-400">Please sign in first.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ backgroundColor: '#0f172a' }}>
      <div className="max-w-lg w-full text-center mb-10">
        <h1 className="text-3xl font-bold text-white mb-3">Welcome to BullsEye Labs</h1>
        <p className="text-slate-400 text-lg">Select your role to get started</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-lg w-full">
        {/* Admin Card */}
        <button
          onClick={() => handleSelectRole('admin')}
          disabled={selecting}
          className="group relative flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-slate-700 hover:border-emerald-500 bg-slate-800/50 hover:bg-slate-800 transition-all duration-200 disabled:opacity-50"
        >
          <div className="h-16 w-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center group-hover:bg-emerald-500/30 transition-colors">
            <Shield className="h-8 w-8 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Tournament Admin</h3>
            <p className="text-sm text-slate-400">Create & manage tournaments, register archers, view all scores</p>
          </div>
        </button>

        {/* Archer Card */}
        <button
          onClick={() => handleSelectRole('archer')}
          disabled={selecting}
          className="group relative flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-slate-700 hover:border-amber-500 bg-slate-800/50 hover:bg-slate-800 transition-all duration-200 disabled:opacity-50"
        >
          <div className="h-16 w-16 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center group-hover:bg-amber-500/30 transition-colors">
            <Target className="h-8 w-8 text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Tournament Archer</h3>
            <p className="text-sm text-slate-400">View tournaments, enter scores, check leaderboard rankings</p>
          </div>
        </button>
      </div>

      {selecting && (
        <p className="mt-6 text-emerald-400 text-sm animate-pulse">Setting up your account...</p>
      )}
    </div>
  );
}