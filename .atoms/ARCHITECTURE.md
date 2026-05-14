# Architecture Design

## System Overview
ArrowLive is a full-stack web application for archery tournament scoring and management. It uses a React frontend with shadcn/ui components and an Atoms Cloud backend providing authentication, PostgreSQL database, and custom API endpoints.

## Tech Stack
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Atoms Cloud (FastAPI + PostgreSQL + Auth)
- **SDK**: @metagptx/web-sdk for auth, entity CRUD, and custom API calls
- **State**: React Context (Auth), React Query (caching), local state

## Module Design
| Module | Responsibility | Key Files |
|--------|---------------|-----------|
| Auth | User authentication via Atoms Cloud OIDC | src/contexts/AuthContext.tsx, src/lib/client.ts |
| Layout | App shell with navigation, header, footer | src/components/Layout.tsx |
| Home | Hero section, tournament listing, quick actions | src/pages/Index.tsx |
| Tournament Create | Form to create new tournaments | src/pages/TournamentCreate.tsx |
| Dashboard | Organizer view: archers, scores, status control | src/pages/TournamentDashboard.tsx |
| Scorecard | Mobile score entry with large tap buttons | src/pages/Scorecard.tsx |
| Leaderboard | Live rankings with auto-refresh | src/pages/Leaderboard.tsx |
| Smart Score | Camera capture prototype for AI scoring | src/pages/SmartScore.tsx |
| Results | Final rankings, export, share/print | src/pages/Results.tsx |
| Custom API | Cross-user tournament operations | backend/routers/tournament_ops.py, backend/services/tournament_ops.py |

## Tech Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Backend | Atoms Cloud | Default backend with auth, DB, storage built-in |
| Custom API | FastAPI router | Cross-user queries (leaderboard, public list) need non-user-scoped access |
| Auth | web-sdk client.auth | Integrated OIDC flow with Atoms Cloud |
| Dark theme | Inline Tailwind + CSS | Navy/emerald/amber palette for outdoor sports aesthetic |
| Score entry | Large 2x2 grid buttons | Mobile-friendly, outdoor-usable with min 44px tap targets |

## File Tree Plan
```
app/
├── backend/
│   ├── models/          # SQLAlchemy ORM (tournaments, tournament_archers, scores)
│   ├── services/        # Business logic (auto-generated + tournament_ops.py)
│   └── routers/         # API endpoints (auto-generated + tournament_ops.py)
└── frontend/
    └── src/
        ├── lib/client.ts
        ├── contexts/AuthContext.tsx
        ├── components/Layout.tsx
        └── pages/
            ├── Index.tsx
            ├── TournamentCreate.tsx
            ├── TournamentDashboard.tsx
            ├── Scorecard.tsx
            ├── Leaderboard.tsx
            ├── SmartScore.tsx
            ├── Results.tsx
            ├── AuthCallback.tsx (read-only)
            └── AuthError.tsx
```

## Implementation Guide
1. Backend tables auto-generated via BackendManager.create_tables
2. Custom API router at /api/v1/tournament/* for public/cross-user operations
3. Frontend uses web-sdk exclusively for all API calls (no fetch/axios)
4. Auth flow: client.auth.toLogin() → /auth/callback → client.auth.me()
5. Entity CRUD for user-owned data, custom API for cross-user queries