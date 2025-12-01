# Deployment Guide

This guide details how to deploy the TaxScape Pro application to **Vercel** (Frontend), **Railway** (Backend), and **Supabase** (Database).

## Prerequisites
- GitHub Account (with this repository pushed)
- Supabase Account
- Railway Account
- Vercel Account
- Google Cloud API Key (for Gemini)

---

## 1. Database (Supabase)
1.  Create a new project in Supabase.
2.  Go to **Project Settings > API**.
3.  Copy the following values:
    -   `Project URL`
    -   `anon` public key
    -   `service_role` secret key (Keep this secret!)
4.  Go to **SQL Editor** and run the schema scripts (if not already done via migration).
    -   Ensure tables `profiles`, `projects`, `employees`, `contractors`, `studies`, `chat_sessions`, `chat_messages` exist.

---

## 2. Backend (Railway)
1.  Log in to Railway and click **New Project > Deploy from GitHub repo**.
2.  Select this repository.
3.  **Configure Service**:
    -   Railway should automatically detect the `Procfile` and `requirements.txt`.
    -   If asked for **Root Directory**, keep it as `/` (root).
4.  **Environment Variables**:
    -   Go to the **Variables** tab.
    -   Add the following:
        -   `SUPABASE_URL`: (From Supabase Project Settings)
        -   `SUPABASE_SERVICE_ROLE_KEY`: (From Supabase Project Settings - **Must be the Service Role Key**)
        -   `GOOGLE_CLOUD_API_KEY`: (Your Gemini API Key)
        -   `GEMINI_MODEL`: `gemini-2.0-flash` (Optional, defaults to this)
5.  **Deploy**:
    -   Railway will build and deploy the app.
    -   Once deployed, go to **Settings > Networking** and copy the **Public Domain** (e.g., `https://taxscape-production.up.railway.app`).
    -   **Important**: This is your `NEXT_PUBLIC_API_URL`.

---

## 3. Frontend (Vercel)
1.  Log in to Vercel and click **Add New > Project**.
2.  Import this repository.
3.  **Configure Project**:
    -   **Framework Preset**: Next.js
    -   **Root Directory**: Click `Edit` and select `frontend`.
4.  **Environment Variables**:
    -   Expand **Environment Variables**.
    -   Add the following:
        -   `NEXT_PUBLIC_SUPABASE_URL`: (From Supabase Project Settings)
        -   `NEXT_PUBLIC_SUPABASE_ANON_KEY`: (From Supabase Project Settings - **Must be the Anon Key**)
        -   `NEXT_PUBLIC_API_URL`: (The Railway Public Domain from Step 2, e.g., `https://taxscape-production.up.railway.app`)
            -   *Note: Do not add a trailing slash.*
5.  **Deploy**:
    -   Click **Deploy**.
    -   Vercel will build the frontend.

---

## 4. Final Configuration
1.  **CORS (Optional but Recommended)**:
    -   Once the Vercel app is live (e.g., `https://taxscape-pro.vercel.app`), you can update the Backend to restrict CORS.
    -   In `app/main.py`, update `allowed_origins` or `allow_origins` to include your specific Vercel domain.
    -   Currently, it allows `*` (all origins) to ensure smooth initial deployment.

## Troubleshooting
-   **Frontend 500 Error**: Check Vercel Logs. Ensure `NEXT_PUBLIC_API_URL` is correct and accessible.
-   **Backend 500 Error**: Check Railway Logs. Ensure `SUPABASE_SERVICE_ROLE_KEY` is correct.
-   **Uploads Fail**: Ensure `openpyxl` and `xlrd` are installed (Railway handles this via `requirements.txt`).

