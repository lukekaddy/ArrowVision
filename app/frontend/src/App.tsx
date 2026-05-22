import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import Index from './pages/Index';
import Landing from './pages/Landing';
import AuthPage from './pages/AuthPage';
import TournamentCreate from './pages/TournamentCreate';
import TournamentEdit from './pages/TournamentEdit';
import TournamentDashboard from './pages/TournamentDashboard';
import Scorecard from './pages/Scorecard';
import Leaderboard from './pages/Leaderboard';
import SmartScore from './pages/SmartScore';
import Results from './pages/Results';
import ReplayCamera from './pages/ReplayCamera';
import CreateScorecard from './pages/CreateScorecard';
import ArcherHome from './pages/ArcherHome';
import ArcherRegister from './pages/ArcherRegister';
import ArcherScorecards from './pages/ArcherScorecards';
import Profile from './pages/Profile';
import MyGroup from './pages/MyGroup';
import ForgotPassword from './pages/ForgotPassword';

const queryClient = new QueryClient();

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Index />} />
    <Route path="/landing" element={<Landing />} />
    <Route path="/auth" element={<AuthPage />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/create-tournament" element={<TournamentCreate />} />
    <Route path="/edit-tournament/:id" element={<TournamentEdit />} />
    <Route path="/create-scorecard" element={<CreateScorecard />} />
    <Route path="/dashboard/:id" element={<TournamentDashboard />} />
    <Route path="/scorecard" element={<Scorecard />} />
    <Route path="/leaderboard" element={<Leaderboard />} />
    <Route path="/smart-score" element={<SmartScore />} />
    <Route path="/results" element={<Results />} />
    <Route path="/replay-camera" element={<ReplayCamera />} />
    <Route path="/profile" element={<Profile />} />
    <Route path="/archer" element={<ArcherHome />} />
    <Route path="/archer/register/:id" element={<ArcherRegister />} />
    <Route path="/archer/my-scorecards" element={<ArcherScorecards />} />
    <Route path="/archer/group" element={<MyGroup />} />
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