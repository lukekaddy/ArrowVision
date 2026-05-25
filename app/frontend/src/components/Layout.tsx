import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Menu, X, User, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

const LOGO_URL = 'https://mgx-backend-cdn.metadl.com/generate/images/1230028/2026-05-14/orhciiaaagnq/arrowlive-logo.png';

interface NavLink {
  to: string;
  label: string;
}

const ADMIN_NAV_LINKS: NavLink[] = [
  { to: '/admin', label: 'Home' },
  { to: '/create-tournament', label: 'Create Tournament' },
  { to: '/create-scorecard', label: 'Create Scorecard' },
  { to: '/scorecard', label: 'Scorecard' },
  { to: '/replay-camera', label: 'Replay Camera' },
  { to: '/leaderboard', label: 'Live Leaderboard' },
  { to: '/results', label: 'Results' },
];

const ARCHER_NAV_LINKS: NavLink[] = [
  { to: '/archer', label: 'Home' },
  { to: '/archer/group', label: 'My Group' },
  { to: '/leaderboard', label: 'Live Leaderboard' },
  { to: '/results', label: 'Results' },
];

const PUBLIC_NAV_LINKS: NavLink[] = [
  { to: '/', label: 'Home' },
  { to: '/leaderboard', label: 'Live Leaderboard' },
  { to: '/results', label: 'Results' },
];



function getNavLinksForRole(role: string | null | undefined, isLoggedIn: boolean): NavLink[] {
  if (!isLoggedIn) {
    return PUBLIC_NAV_LINKS;
  }
  if (role === 'admin') {
    return ADMIN_NAV_LINKS;
  }
  return ARCHER_NAV_LINKS;
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const navLinks = getNavLinksForRole(user?.role, isAuthenticated);

  const handleSignIn = () => {
    navigate('/landing');
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0f172a' }}>
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-700/50 backdrop-blur-md" style={{ backgroundColor: 'rgba(15, 23, 42, 0.95)' }}>
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={LOGO_URL} alt="BullsEye Labs" className="h-9 w-9 rounded-lg" />
            <span className="text-xl font-bold text-white">
              BullsEye<span className="text-emerald-400"> Labs</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === link.to
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                {link.label}
              </Link>
            ))}


          </nav>

          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate('/profile')}
                  className="h-8 w-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center hover:bg-emerald-500/30 transition-colors cursor-pointer"
                  title="Profile"
                >
                  <User className="h-4 w-4 text-emerald-400" />
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { logout(); navigate('/landing'); }}
                  className="text-slate-400 hover:text-white hidden md:flex"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                onClick={handleSignIn}
                size="sm"
                className="bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                Sign In
              </Button>
            )}

            {/* Mobile menu button */}
            <button
              className="md:hidden p-2 text-slate-300 hover:text-white"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        {menuOpen && (
          <div className="md:hidden border-t border-slate-700/50 px-4 py-3 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMenuOpen(false)}
                className={`block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === link.to
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                {link.label}
              </Link>
            ))}

            {isAuthenticated && (
              <button
                onClick={() => { logout(); setMenuOpen(false); navigate('/landing'); }}
                className="block w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-slate-700/50"
              >
                Sign Out
              </button>
            )}
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-700/50 py-6 px-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-slate-500">
          <span>© 2026 BullsEye Labs. Digital archery scoring.</span>
          <div className="flex gap-4">
            <Link to="/leaderboard" className="hover:text-slate-300 transition-colors">Live Leaderboard</Link>
            <Link to="/results" className="hover:text-slate-300 transition-colors">Results</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}