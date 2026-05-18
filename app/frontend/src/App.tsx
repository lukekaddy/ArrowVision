import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import Index from './pages/Index';
import AuthCallback from './pages/AuthCallback';
import AuthError from './pages/AuthError';
import TournamentCreate from './pages/TournamentCreate';
import TournamentDashboard from './pages/TournamentDashboard';
import Scorecard from './pages/Scorecard';
import Leaderboard from './pages/Leaderboard';
import SmartScore from './pages/SmartScore';
import Results from './pages/Results';
import RoleSelection from './pages/RoleSelection';

const queryClient = new QueryClient();

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Index />} />
    <Route path="/create-tournament" element={<TournamentCreate />} />
    <Route path="/dashboard/:id" element={<TournamentDashboard />} />
    <Route path="/scorecard" element={<Scorecard />} />
    <Route path="/leaderboard" element={<Leaderboard />} />
    <Route path="/smart-score" element={<SmartScore />} />
    <Route path="/results" element={<Results />} />
    <Route path="/role-select" element={<RoleSelection />} />
    <Route path="/auth/callback" element={<AuthCallback />} />
    <Route path="/auth/error" element={<AuthError />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
export { AppRoutes };