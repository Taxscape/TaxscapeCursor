# 🚂 Deploy TaxScape Pro Backend to Railway

## Overview

This guide will help you deploy your backend to Railway so it runs 24/7 in the cloud, not on your local computer.

**What you'll get:**
- ✅ Backend running 24/7 on Railway
- ✅ AI Chatbot powered by Google Gemini
- ✅ Database on Supabase
- ✅ Frontend can be deployed on Vercel

---

## Prerequisites

Before starting, make sure you have:
1. **GitHub account** with your code pushed
2. **Supabase project** set up with the schema
3. **Google Gemini API key** from https://aistudio.google.com/apikey

---

## Step 1: Create Railway Account

1. Go to https://railway.app
2. Click **"Start a New Project"**
3. Sign up with GitHub (recommended)

---

## Step 2: Deploy from GitHub

1. In Railway Dashboard, click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Connect your GitHub account if prompted
4. Select your repository: `Taxscape/TaxscapeCursor` (or your repo name)
5. Railway will automatically detect it's a Python project

---

## Step 3: Set Environment Variables

This is the most important step! Click on your service → **Variables** tab

Add these variables (copy each line):

```
GOOGLE_CLOUD_API_KEY=<your_gemini_api_key>
SUPABASE_URL=<your_supabase_url>
SUPABASE_SERVICE_ROLE_KEY=<your_service_role_key>
SUPABASE_ANON_KEY=<your_supabase_anon_key>
```

### Where to get these values:

| Variable | Where to find it |
|----------|-----------------|
| `GOOGLE_CLOUD_API_KEY` | https://aistudio.google.com/apikey |
| `SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → service_role (secret) |
| `SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → anon (public) |

---

## Step 4: Generate Your Backend URL

1. Go to your Railway service
2. Click **"Settings"** tab
3. Scroll to **"Networking"** section
4. Click **"Generate Domain"**
5. Copy the URL (e.g., `https://taxscape-production.up.railway.app`)

**Save this URL!** You'll need it for the frontend.

---

## Step 5: Test Your Backend

Open a terminal and run:

```bash
# Test health endpoint
curl https://YOUR-RAILWAY-URL.up.railway.app/health

# Expected response:
# {"status":"healthy","timestamp":"...","services":{"database":"connected","ai":"configured"}}
```

Test the chatbot:

```bash
curl -X POST https://YOUR-RAILWAY-URL.up.railway.app/api/chat_demo \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "What is the R&D tax credit?"}]}'
```

---

## Step 6: Connect Your Frontend

### Option A: Vercel (Recommended for Production)

1. Go to https://vercel.com
2. Import your frontend from GitHub (the `frontend` folder)
3. Go to **Settings** → **Environment Variables**
4. Add these variables:

```
NEXT_PUBLIC_API_URL=https://YOUR-RAILWAY-URL.up.railway.app
NEXT_PUBLIC_SUPABASE_URL=<your_supabase_url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your_supabase_anon_key>
```

5. **Redeploy** your frontend

### Option B: Local Development

Create `frontend/.env.local`:

```
NEXT_PUBLIC_API_URL=https://YOUR-RAILWAY-URL.up.railway.app
NEXT_PUBLIC_SUPABASE_URL=<your_supabase_url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your_supabase_anon_key>
```

Then run:
```bash
cd frontend
npm install
npm run dev
```

---

## Step 7: Verify Everything Works

1. Open your frontend (Vercel URL or localhost:3000)
2. Try the chatbot - type "What is R&D tax credit?"
3. You should get an AI response!

If it works, you're done! 🎉

---

## Troubleshooting

### "Gemini client not initialized"
- Check `GOOGLE_CLOUD_API_KEY` is set in Railway Variables
- Make sure the API key is valid (test at https://aistudio.google.com)

### "Database not available"
- Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set
- Verify your Supabase project is active

### Frontend can't connect to backend
- Verify `NEXT_PUBLIC_API_URL` points to your Railway URL
- Make sure the URL starts with `https://`
- Check Railway logs for errors

### Application failed to respond
1. Check Railway logs: Service → Deployments → View logs
2. Look for startup errors
3. Verify all environment variables are set

---

## Monitoring & Logs

### View Logs
1. Railway Dashboard → Your Service
2. Click **"Deployments"**
3. Click latest deployment → **"View logs"**

### What to look for in logs:
```
🚀 TaxScape Pro API starting on port 8000
📊 Supabase connected: True
🤖 AI Service: Configured
```

If you see `AI Service: NOT CONFIGURED`, your API key is missing.

---

## Cost Estimate

**Railway Free Tier:**
- $5/month free credits
- Typical usage: $0-3/month for development/low traffic
- Upgrade when needed

**Supabase Free Tier:**
- 500MB database
- 1GB file storage
- 50,000 monthly active users

---

## Quick Reference

| Service | URL |
|---------|-----|
| Railway Dashboard | https://railway.app/dashboard |
| Supabase Dashboard | https://supabase.com/dashboard |
| Vercel Dashboard | https://vercel.com/dashboard |
| Google AI Studio | https://aistudio.google.com |

---

## Need Help?

1. Check Railway logs for errors
2. Verify all environment variables
3. Test endpoints with curl
4. Check Supabase connection

Your backend is now running 24/7 in the cloud! 🚀
