# Requirements & Progress

## Requirements Overview
Build "ArrowLive" - a mobile-first web app for archery tournament scoring and management. Dark modern UI, outdoor sports aesthetic, large buttons, fast navigation.

## User Stories
- Organizers can create/manage tournaments, assign groups, monitor live scores, resolve disputes, export results
- Archers can view tournaments, enter scores via tap interface, view leaderboard
- Scorekeepers can enter scores for their assigned group

## Task Breakdown
- [x] Create custom_users table for email/password auth (first_name, last_name, email, phone, password_hash, role)
- [x] Build backend auth endpoints: POST /api/v1/custom-auth/register, POST /api/v1/custom-auth/login, GET /api/v1/custom-auth/me
- [x] Redesign landing page as role selection splash (Admin vs Archer cards)
- [x] Build Sign In / Register page with tabbed interface
- [x] Update AuthContext to use custom JWT auth instead of OIDC
- [x] Remove archer registration from admin Tournament Dashboard (keep read-only list)
- [x] Update Archer Home with tournament registration flow and scorecard viewing
- [x] Create database tables (tournaments, tournament_archers, scores)
- [x] Build backend API endpoint `/api/v1/tournament/my-tournaments` for archer's registered tournaments
- [x] Build Archer Home Page (`/archer`) with upcoming tournaments and registered tournaments
- [x] Build Tournament Registration Page (`/archer/register/:id`) for archers to register
- [x] Build My Scorecards Page (`/archer/my-scorecards`) with personal scorecard history
- [x] Update Layout.tsx with role-based navigation (admin nav vs archer nav)
- [x] Update routing: role-based redirect from `/` and add archer routes to App.tsx
- [x] Create scoring_templates database table
- [x] Create backend API endpoints for scorecard template CRUD
- [x] Build Create Scorecard page with 2 templates + custom option
- [x] Update TournamentCreate flow to navigate to Create Scorecard after creation
- [x] Update Scorecard page to inherit scoring template from tournament
- [x] Add routing for Create Scorecard page
- [x] Restructure main navigation to: Home, Create Tournament, Create Scorecard, Live Leaderboard, Results
- [x] Redesign Home tab with upcoming tournaments, recent activity, quick-action buttons, active indicators
- [x] Update Create Scorecard to show previously created scorecards section
- [x] Update Create Tournament with scorecard dropdown + preview
- [x] Redesign Live Leaderboard with active tournament indicators
- [x] Build Results page with tournament search and scorecard search sections (with archer name filter)
- [x] Add expandable inline archer score details in Results
- [x] Remove Scorecard and Smart Score from main navigation
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
- [x] Create storage bucket "arrow-replays" for video clips
- [x] Create "replay_videos" database table
- [x] Build POST /api/v1/replays/upload endpoint for video upload with metadata
- [x] Build GET /api/v1/replays/get endpoint to retrieve replay by archer+target
- [x] Update SmartScore page to fetch and display actual uploaded replay video

- [x] Create archer_groups database table (tournament_id, group_name, group_number, shooting_order_mode, creator_id)
- [x] Add group_name column to tournament_archers table
- [x] Build backend group management service (create, leave, get groups, get ungrouped, shooting order, update mode)
- [x] Build backend group management router with 6 endpoints at /api/v1/groups/*
- [x] Update ArcherRegister.tsx with "Start a Group" toggle, searchable multi-select of ungrouped archers
- [x] Create MyGroup.tsx page with group info, members, shooting order, leave/manage options
- [x] Add /archer/group route and "My Group" nav link for archers
- [x] Build TournamentEdit page for editing upcoming tournaments
- [x] Add /edit-tournament/:id route to App.tsx
- [x] Add Edit button (pencil icon) on upcoming tournament cards in Index.tsx

- [x] Rename Upload Replay to "Replay Camera" and add to main nav tabs
- [x] Build Replay Camera page with live camera preview, mic access, wake lock, target/shooter display, status
- [x] Implement continuous video buffer (rolling 10s ring buffer using MediaRecorder)
- [x] Implement sound-based impact detection (Web Audio API, sensitivity slider, cooldown)
- [x] Implement replay clip generation (3s before + 3s after impact → MP4 blob)
- [x] Implement auto-upload to cloud storage + database record creation
- [x] Add scorecard integration (replay icon per target, inline video playback)

- [x] Add download button for arrow replay video on SmartScore page
- [x] Add Forgot Password UI flow (placeholder, no email service)
- [x] Add GET /api/v1/groups/my-groups endpoint for fetching all user's groups across tournaments
- [x] Rewrite MyGroup.tsx with expandable group cards, shooting order, mode management, leave group
- [x] Add GET /api/v1/groups/my-groups endpoint for fetching all user's groups across tournaments
- [x] Rewrite MyGroup.tsx with expandable group cards, shooting order, mode management, leave group

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
- Added: Create Scorecard feature - scoring_templates DB table, POST/GET API endpoints, CreateScorecard page with Standard/Extended/Custom templates
- Updated: TournamentCreate navigates to Create Scorecard after tournament creation
- Updated: Scorecard fetches scoring template and passes scoreValues to SmartScore
- Updated: SmartScore dynamically renders score buttons from template values (falls back to [10,8,5,0])