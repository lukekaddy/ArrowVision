import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Mail, CheckCircle2 } from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-4 py-8">
      {/* Back link */}
      <div className="w-full max-w-md mb-6">
        <Link
          to="/auth"
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Sign In
        </Link>
      </div>

      {/* Card */}
      <div className="w-full max-w-md rounded-2xl border border-slate-700/50 bg-slate-900/80 backdrop-blur-sm p-8">
        {!submitted ? (
          <>
            {/* Header */}
            <div className="flex flex-col items-center mb-6">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4">
                <Mail className="h-6 w-6 text-emerald-400" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Reset Password</h1>
              <p className="text-slate-400 text-sm text-center">
                Enter your email address and we&apos;ll send you a link to reset your password.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email" className="text-slate-300">Email Address</Label>
                <Input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-11"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                Send Reset Link
              </Button>
            </form>
          </>
        ) : (
          <>
            {/* Success State */}
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4">
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-3">Check Your Email</h1>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                If an account exists with that email, you&apos;ll receive a password reset link shortly. Please check your inbox.
              </p>
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Sign In
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}