# TaxScape Frontend

Next.js (App Router) experience that replaces the old Streamlit UI. It consumes the existing FastAPI backend exposed under `http://localhost:8001`.

## Getting Started

```bash
cd frontend
npm install  # or pnpm install / yarn
npm run dev
```

Create a `.env.local` (or copy `env.local.example`) and set:

```
NEXT_PUBLIC_API_URL=http://localhost:8001
```

## Available Views

- `/` – immersive landing page with a live AI auditor chat experience

## Production Build

```bash
npm run build
npm run start
```

Deploy the `frontend` directory to any Node 18+ host and ensure it can reach the FastAPI service.

## One-command local stack

From the repo root you can start FastAPI **and** this Next.js app together:

```bash
./run_local.sh
```

The script installs Python + Node dependencies as needed, seeds `.env.local`, and boots:
- FastAPI on `http://localhost:8001`
- Next.js on `http://localhost:3000`

## LLM Configuration

The backend now uses Google Gemini. Before running `./run_local.sh`, set:

```bash
export GEMINI_API_KEY="your-key"
# optional, defaults to models/gemini-1.5-pro-latest
export GEMINI_MODEL="tunedModels/your-special-model"
# or create a .env file at the repo root with these values
```

Once the backend has access to the Gemini key, the chat panel on `/` will call `/api/chat_demo` and stream responses (including structured JSON payloads when the agent emits them).

