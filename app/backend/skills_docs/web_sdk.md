# Frontend API Authentication

This project uses the FastAPI JWT authentication endpoints as the single auth source of truth.

- Register: `POST /api/v1/auth/register` with `email`, `password`, and `role` (`admin` or `archer`).
- Login: `POST /api/v1/auth/login` returns `access_token` plus the authenticated user object.
- Current user: `GET /api/v1/auth/me` with `Authorization: Bearer <access_token>`.
- The frontend stores the JWT in `localStorage` and sends it as a bearer token for protected API calls.

Do not add SDK auth redirects or separate auth routers.
