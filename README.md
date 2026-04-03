# Watchtower

Personal health tracking API for logging meals, blood glucose readings, and medications.

## Setup

```bash
# Install dependencies
npm install

# Create your .env file
cp .env.example .env
# Edit .env: set APP_PASSWORD and SESSION_SECRET (see Authentication)
```

## Run

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

## Authentication

Sign-in uses an **HttpOnly session cookie** (not a client-visible API key). Configure:

| Variable | Purpose |
|----------|---------|
| `APP_PASSWORD` | Password you enter in the web app to sign in |
| `SESSION_SECRET` | Server-only secret used to sign session tokens (long random string) |

- **`GET /health`** — public (for load balancers / Railway health checks).
- **`POST /api/login`**, **`POST /api/logout`**, **`GET /api/session`** — public (login/session check).
- **All other `/api/*` routes** — require a valid session cookie (sign in via the app first).

Static files (`/`, JS, CSS, `manifest.json`, icons) are served without logging in so **PWA install and icons** work; the API stays protected until you authenticate.

### Scripting with curl

```bash
# Sign in and save cookies
curl -c cookies.txt -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"YOUR_APP_PASSWORD"}'

# Call the API with the session cookie
curl -b cookies.txt http://localhost:3000/api/readings
```

### Railway

Set `APP_PASSWORD` and `SESSION_SECRET` in Railway Variables. Point the HTTP health check at **`GET /health`**. Use a **volume** for the SQLite file if you need data to survive redeploys.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (no auth) |
| POST | `/api/login` | Sign in (JSON body `{"password":"..."}`) |
| POST | `/api/logout` | Sign out (clears cookie) |
| GET | `/api/session` | Returns 200 if session valid, 401 otherwise |
| POST | `/api/meals` | Log a meal |
| GET | `/api/meals` | List all meals |
| GET | `/api/meals/today` | Today's meals |
| DELETE | `/api/meals/:id` | Delete a meal |
| POST | `/api/readings` | Log a blood glucose reading |
| GET | `/api/readings` | List all readings |
| GET | `/api/readings/today` | Today's readings |
| DELETE | `/api/readings/:id` | Delete a reading |
| GET | `/api/medications` | List all medications |
| PATCH | `/api/medications/:id` | Update a medication |
| GET | `/api/day/:date` | Full day view (YYYY-MM-DD) |
