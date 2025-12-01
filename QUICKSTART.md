# TaxScape Pro - Quick Start Guide

## ✅ CHATBOT IS NOW WORKING!

The issue was that the **backend server was not running**. I've started it for you.

## Running Locally

### Backend (Required for Chatbot)
```bash
cd /Users/dhruvramasubban/Desktop/TaxScapeCursor
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

**Expected Output:**
```
INFO: Uvicorn running on http://0.0.0.0:8001
INFO: Gemini client initialized successfully
INFO: Application startup complete.
```

### Frontend
```bash
cd /Users/dhruvramasubban/Desktop/TaxScapeCursor/frontend
npm run dev
```

Open: http://localhost:3000

## Testing Chatbot

### Via Terminal (Direct API Test)
```bash
curl -X POST http://localhost:8001/api/chat_demo \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Tell me about R&D tax credits"}]}'
```

### Via Frontend
1. Open http://localhost:3000
2. Type a message in the chat
3. Should get response from AI auditor

## Environment Variables Required

### Backend (.env in root directory)
```
GOOGLE_CLOUD_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-2.0-flash
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Frontend (.env.local in frontend directory)
```
NEXT_PUBLIC_API_URL=http://localhost:8001
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

## Production (Vercel + Railway)

### Already Deployed
- Frontend: Vercel (auto-deploys from GitHub)
- Backend: Railway (auto-deploys from GitHub)

### Check Railway Logs
If chatbot doesn't work in production:
1. Go to Railway dashboard
2. Check logs for errors
3. Verify environment variables are set

## Troubleshooting

### "Gemini client not initialized"
- Check API key is set: `echo $GOOGLE_CLOUD_API_KEY`
- Restart backend after setting env vars

### "Failed to connect to localhost:8001"
- Backend not running
- Run the backend command above

### Chat not responding in frontend
- Check browser console (F12) for errors
- Verify `NEXT_PUBLIC_API_URL=http://localhost:8001` in frontend/.env.local
