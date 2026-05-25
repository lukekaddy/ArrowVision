import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Loader2, Shield, Target } from 'lucide-react';

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const roleParam = searchParams.get('role');
  const role: 'admin' | 'archer' = roleParam === 'admin' ? 'admin' : 'archer';
  const isAdmin = role === 'admin';

  const [activeTab, setActiveTab] = useState<'signin' | 'register'>('signin');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');

  const { login, register } = useAuth();
  const navigate = useNavigate();

  const redirectForRole = (userRole: string) => {
    navigate(userRole === 'admin' ? '/admin' : '/archer', { replace: true });
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const user = await login(email, password);
      redirectForRole(user.role);
    } catch (err: any) {
      setError(err?.message || 'Invalid email or password');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const user = await register({
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        phone,
        role,
      });
      redirectForRole(user.role);
    } catch (err: any) {
      setError(err?.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  const roleStyles = isAdmin
    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
    : 'bg-amber-500/10 border border-amber-500/30 text-amber-400';

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md mb-6">
        <Link
          to="/landing"
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>
      </div>

      <div className="w-full max-w-md rounded-2xl border border-slate-700/50 bg-slate-900/80 backdrop-blur-sm p-8">
        <div className="flex items-center justify-center mb-6">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${roleStyles}`}>
            {isAdmin ? <Shield className="h-4 w-4" /> : <Target className="h-4 w-4" />}
            <span className="text-sm font-medium">
              {isAdmin ? 'Tournament Admin' : 'Tournament Archer'}
            </span>
          </div>
        </div>

        <div className="flex rounded-lg bg-slate-800/50 p-1 mb-6">
          <button
            type="button"
            onClick={() => {
              setActiveTab('signin');
              setError('');
            }}
            className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-all ${
              activeTab === 'signin'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('register');
              setError('');
            }}
            className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-all ${
              activeTab === 'register'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Create Account
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {activeTab === 'signin' && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="signin-email" className="text-slate-300">
                Email
              </Label>
              <Input
                id="signin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signin-password" className="text-slate-300">
                Password
              </Label>
              <Input
                id="signin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Password"
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-11"
              />
            </div>
            <Button
              type="submit"
              disabled={submitting}
              className={`w-full h-12 text-base font-semibold ${
                isAdmin
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                  : 'bg-amber-500 hover:bg-amber-600 text-black'
              }`}
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Sign In'}
            </Button>
          </form>
        )}

        {activeTab === 'register' && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="reg-firstname" className="text-slate-300">
                  First Name
                </Label>
                <Input
                  id="reg-firstname"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-lastname" className="text-slate-300">
                  Last Name
                </Label>
                <Input
                  id="reg-lastname"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-11"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-email" className="text-slate-300">
                Email
              </Label>
              <Input
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-phone" className="text-slate-300">
                Phone
              </Label>
              <Input
                id="reg-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-password" className="text-slate-300">
                Password
              </Label>
              <Input
                id="reg-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Password"
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-11"
              />
            </div>
            <Button
              type="submit"
              disabled={submitting}
              className={`w-full h-12 text-base font-semibold ${
                isAdmin
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                  : 'bg-amber-500 hover:bg-amber-600 text-black'
              }`}
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Create Account'}
            </Button>
          </form>
        )}

        <div className="mt-6 text-center">
          <p className="text-slate-500 text-sm">
            {isAdmin ? 'Looking to compete?' : 'Want to manage tournaments?'}{' '}
            <Link
              to={`/auth?role=${isAdmin ? 'archer' : 'admin'}`}
              className={`font-medium transition-colors ${
                isAdmin
                  ? 'text-amber-400 hover:text-amber-300'
                  : 'text-emerald-400 hover:text-emerald-300'
              }`}
            >
              {isAdmin ? 'Sign up as Archer' : 'Sign up as Admin'}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
