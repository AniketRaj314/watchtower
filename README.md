# Watchtower

Personal health tracking API for logging meals, blood glucose readings, and medications.

## Setup

```bash
# Install dependencies
npm install

# Create your .env file
cp .env.example .env
# Edit .env and set your API_KEY
```

## Run

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

## Authentication

All `/api/*` endpoints require the `X-API-Key` header matching the `API_KEY` in your `.env` file.

The `/health` endpoint is public.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (no auth) |
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
