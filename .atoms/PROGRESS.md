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
- [x] Add mulligan support to Create Tournament page
- [x] Update archer registration with first/last name, phone, division dropdown, purchased mulligans
- [x] Update Scorecard: remove score buttons, make target number clickable to navigate to Smart Score
- [x] Rewrite Smart Score page with target context, camera capture, and score submission
- [x] Add tournament location field to Create Tournament, Index, and Dashboard
- [x] Redesign Scorecard: after filter show "Tap to View Score Card", then scrollable target list
- [x] Redesign SmartScore: remove before/after photos, add video replay, lock score at 10 with manual override
- [x] Generate arrow-hitting-target video clip
- [x] Change "Tap to View Score Card" to "Tap to View Score Details" with total score display
- [x] Track scores in localStorage and show scored targets with green checkmarks
- [x] Save scores from SmartScore to localStorage for Scorecard persistence
- [x] Generate realistic fixed-camera arrow hit video
- [x] Fix post-score navigation: SmartScore passes context params back to Scorecard so it auto-shows target list
- [x] Add user_roles database table and seed admin role for luke.kadillak@gmail.com
- [x] Create backend API endpoint for get/set user roles
- [x] Update AuthContext to fetch and store current user's role
- [x] Add role-based navigation in Layout/Header
- [x] Add route protection for admin-only pages
- [x] Add role selection on first login for new users

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
- Fixed: Database schema synced - all columns now exist in actual DB tables
- Updated: Courses now support custom names - text input for name + number input for targets in TournamentCreate
- Updated: Leaderboard and Scorecard show course names with fallback to "Course N"
- Added: Mulligan support in TournamentCreate - toggle to enable, multi-pick types (Mulligans/Doe Tags/Custom), max allowed per type, restricted targets option
- Updated: Archer registration in TournamentDashboard - first/last name, phone, division dropdown from tournament config, purchased mulligans toggle with type/count inputs
- Backend: Added mulligans column to tournaments, first_name/last_name/phone/purchased_mulligans to tournament_archers
- Backend: Updated register-archer endpoint and service to handle new fields
- Updated: Scorecard no longer has score buttons — target number is now clickable, navigates to Smart Score with full context
- Updated: Smart Score page fully rewritten — reads target/archer/course from URL params, before/after camera capture, score submission via API, confirmation with back navigation