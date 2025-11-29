# TaxScape Pro Deployment Guide

This guide walks you through deploying TaxScape Pro as a production web application.

## Prerequisites

- [Supabase](https://supabase.com) account (free tier works)
- [Vercel](https://vercel.com) account (free tier works)
- [Railway](https://railway.app) or [Render](https://render.com) account for backend
- Google Gemini API key from [AI Studio](https://aistudio.google.com/apikey)

---

## Step 1: Set Up Supabase

### 1.1 Create a new Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your project URL and keys from Settings > API:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

### 1.2 Run the database schema

1. Go to SQL Editor in your Supabase dashboard
2. Copy the contents of `supabase/schema.sql`
3. Paste and run the SQL to create all tables and policies

### 1.3 Create Storage bucket

1. Go to Storage in your Supabase dashboard
2. Create a new bucket called `studies`
3. Set it to private (not public)

### 1.4 Make yourself an admin

Run this SQL in the SQL Editor (replace with your email):

```sql
UPDATE profiles 
SET is_admin = true 
WHERE email = 'your-email@example.com';
```

---

## Step 2: Deploy the Backend (FastAPI)

### Option A: Railway (Recommended)

1. Go to [railway.app](https://railway.app)
2. Create a new project from GitHub repo
3. Select the repository
4. Add environment variables:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   GOOGLE_CLOUD_API_KEY=your-gemini-api-key
   ```
5. Set the start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. Deploy and note the URL (e.g., `https://taxscape-backend.railway.app`)

### Option B: Render

1. Go to [render.com](https://render.com)
2. Create a new Web Service
3. Connect your GitHub repo
4. Set build command: `pip install -r requirements.txt`
5. Set start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. Add environment variables (same as above)
7. Deploy and note the URL

---

## Step 3: Deploy the Frontend (Next.js on Vercel)

### 3.1 Deploy to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Import your GitHub repository
3. Set the root directory to `frontend`
4. Add environment variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   NEXT_PUBLIC_API_URL=https://your-backend.railway.app
   ```
5. Deploy

### 3.2 Configure custom domain (optional)

1. Go to your Vercel project settings
2. Add your custom domain
3. Update DNS records as instructed

---

## Step 4: Configure CORS

Update your backend's CORS settings in `app/main.py` to include your production domains:

```python
allowed_origins = [
    "http://localhost:3000",
    "https://your-app.vercel.app",
    "https://your-custom-domain.com",
]
```

Redeploy the backend after making this change.

---

## Environment Variables Summary

### Frontend (Vercel)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://abc123.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key | `eyJhbG...` |
| `NEXT_PUBLIC_API_URL` | Backend API URL | `https://api.taxscape.com` |

### Backend (Railway/Render)

| Variable | Description | Example |
|----------|-------------|---------|
| `SUPABASE_URL` | Supabase project URL | `https://abc123.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | `eyJhbG...` |
| `GOOGLE_CLOUD_API_KEY` | Gemini API key | `AIzaSy...` |
| `GEMINI_MODEL` | (Optional) Model override | `gemini-2.0-flash` |

---

## Testing the Deployment

1. Visit your frontend URL
2. Register a new account
3. Verify email (check Supabase Auth > Users)
4. Log in and test the AI auditor
5. Generate a study
6. Check admin portal (if you're an admin)

---

## Troubleshooting

### "Failed to fetch" errors
- Check that CORS is configured correctly
- Verify `NEXT_PUBLIC_API_URL` points to your backend

### Auth not working
- Verify Supabase keys are correct
- Check that the database schema was applied
- Ensure the `profiles` trigger is working

### AI not responding
- Verify `GOOGLE_CLOUD_API_KEY` is set on the backend
- Check Railway/Render logs for errors

### Admin portal not accessible
- Run the SQL to make yourself an admin
- Clear browser cache and log in again

---

## Updating the Application

### Frontend
Push to your main branch → Vercel auto-deploys

### Backend
Push to your main branch → Railway/Render auto-deploys

### Database
Run new migrations in Supabase SQL Editor

---

## Security Checklist

- [ ] Supabase RLS policies are enabled
- [ ] Service role key is only on backend (never exposed to frontend)
- [ ] CORS is restricted to your domains
- [ ] Environment variables are set in deployment platform (not committed)
- [ ] Admin accounts are manually verified

