# Requirements & Progress

## Requirements Overview
Build "ArrowLive" - a mobile-first web app for archery tournament scoring and management. Dark modern UI, outdoor sports aesthetic, large buttons, fast navigation.

## User Stories
- Organizers can create/manage tournaments, assign groups, monitor live scores, resolve disputes, export results
- Archers can view tournaments, enter scores via tap interface, view leaderboard
- Scorekeepers can enter scores for their assigned group

## Task Breakdown
- [x] Create database tables (tournaments, tournament_archers, scores)
- [x] Create custom backend API for cross-user operations (leaderboard, public tournaments, register, score submission)
- [x] Generate project images (hero banner, target, logo, tournament scene)
- [x] Build shared components (Layout, Header, AuthProvider)
- [x] Build Home page with tournament list and quick actions
- [x] Build Tournament Management page (create/edit tournaments)
- [x] Build Scorecard page (mobile-friendly score entry)
- [x] Build Leaderboard page (real-time rankings)
- [x] Build Smart Score prototype page (camera capture mock)
- [x] Build Organizer Dashboard page
- [x] Build Results page
- [x] Configure routing in App.tsx

## Progress Log
- Backend tables created: tournaments, tournament_archers, scores
- Custom API router created: /api/v1/tournament/* for public and cross-user operations
- Generated 4 images for the app
- All frontend pages implemented and routing configured
- Updated: Divisions field is now multi-pick with preset toggles + custom input
- Updated: Status field removed, auto-inferred from tournament date (active/upcoming/completed)
- Updated: Added courses system - configurable number of courses with targets per course
- Updated: Leaderboard supports filtering by specific course after selecting tournament
- Backend: Added courses column to tournaments, course_number to scores, updated service/router