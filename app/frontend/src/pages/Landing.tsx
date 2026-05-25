import { Link } from 'react-router-dom';
import { Shield, Target } from 'lucide-react';

const HERO_URL = 'https://mgx-backend-cdn.metadl.com/generate/images/1230028/2026-05-14/orhcm3yaagpa/hero-archery-sunset.png';

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden">
        <img src={HERO_URL} alt="" className="w-full h-full object-cover opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0f172a]/70 via-[#0f172a]/90 to-[#0f172a]" />
      </div>

      {/* Content */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-4 py-12">
        {/* Branding */}
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-6xl font-extrabold text-white tracking-tight mb-2">
            BullsEye<span className="text-emerald-400"> Labs</span>
          </h1>
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="h-px w-12 bg-gradient-to-r from-transparent to-emerald-500/50" />
            <span className="text-emerald-400 font-semibold text-lg tracking-wide">ArrowLive</span>
            <div className="h-px w-12 bg-gradient-to-l from-transparent to-emerald-500/50" />
          </div>
          <p className="text-slate-400 text-lg max-w-md mx-auto">
            Digital Tournament Scoring
          </p>
        </div>

        {/* Role Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-2xl mb-10">
          {/* Admin Card */}
          <Link
            to="/auth?role=admin"
            className="group relative rounded-2xl border border-emerald-500/30 bg-slate-900/80 backdrop-blur-sm p-8 hover:border-emerald-500/60 hover:bg-emerald-500/5 transition-all duration-300"
          >
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative">
              <div className="h-16 w-16 rounded-xl bg-emerald-500/20 flex items-center justify-center mb-5 group-hover:bg-emerald-500/30 transition-colors">
                <Shield className="h-8 w-8 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2 group-hover:text-emerald-400 transition-colors">
                Tournament Admin
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                Create & manage tournaments, scorecards, and view results
              </p>
            </div>
          </Link>

          {/* Archer Card */}
          <Link
            to="/auth?role=archer"
            className="group relative rounded-2xl border border-amber-500/30 bg-slate-900/80 backdrop-blur-sm p-8 hover:border-amber-500/60 hover:bg-amber-500/5 transition-all duration-300"
          >
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative">
              <div className="h-16 w-16 rounded-xl bg-amber-500/20 flex items-center justify-center mb-5 group-hover:bg-amber-500/30 transition-colors">
                <Target className="h-8 w-8 text-amber-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2 group-hover:text-amber-400 transition-colors">
                Tournament Archer
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                Register for tournaments, view your scores, and compete
              </p>
            </div>
          </Link>
        </div>

        {/* Sign In Link */}
        <p className="text-slate-500 text-sm">
          Already have an account?{' '}
          <Link to="/auth" className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}