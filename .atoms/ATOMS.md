# Project Context

## Project Overview
ArrowLive - Mobile-first archery tournament scoring and management web app. Replaces paper scorecards with digital live scoring and leaderboard updates.

## Key Decisions
| Date | Decision | By | Rationale |
|------|----------|-----|-----------|
| 2026-05-14 | Use Atoms Cloud backend | Alex | Default backend, provides auth, DB, storage |
| 2026-05-14 | Dark modern UI theme | Alex | Outdoor-friendly, sports aesthetic per requirements |
| 2026-05-14 | Custom API for leaderboard | Alex | Cross-user data access needed for public leaderboard |

## Constraints
- Design: Dark modern UI with outdoor/sports aesthetic
- Color Palette: Navy (#0f172a) base, Emerald green (#10b981) primary accent, Amber (#f59e0b) secondary accent, White text on dark backgrounds
- Typography: Inter font family, large touch-friendly buttons (min 44px tap targets)
- Layout: Mobile-first, single column on mobile, responsive grid on desktop
- Large score buttons (10/8/5/Miss) for outdoor use
- Minimal clutter, fast navigation