# Frontend API Authentication

This project uses Supabase as the only authentication and user identity provider.

- Login and signup use the Supabase JavaScript client.
- Role comes from Supabase user metadata or the `profiles.role` field.
- The frontend may forward the Supabase access token to FastAPI business APIs that need user context.
- FastAPI does not provide login, signup, or a parallel auth system.

Do not add FastAPI login/register endpoints or SDK auth redirects.
