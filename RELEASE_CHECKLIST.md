# TaxScape Pro Release Checklist

This document outlines the steps required for a production release of TaxScape Pro.

## Pre-Release Verification

### 1. Environment Variables

Verify all required environment variables are set:

**Backend (Railway/Render):**
```bash
# Required
SUPABASE_URL=your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>  # Never expose!
GOOGLE_CLOUD_API_KEY=<gemini-api-key>

# Optional but recommended
ENVIRONMENT=production
CORS_ORIGINS=https://taxscape.ai,https://app.taxscape.ai
LOG_LEVEL=INFO
```

**Frontend (Vercel):**
```bash
NEXT_PUBLIC_SUPABASE_URL=your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
NEXT_PUBLIC_API_URL=https://taxscape-api.railway.app
```

### 2. Database Migrations

Run all pending migrations in order:

```bash
# List of migrations (run in order)
1. supabase/migration_prompt2_workspace.sql  # Canonical tables
2. supabase/migration_studies.sql            # Study generation
3. supabase/migration_roles_permissions.sql  # Capabilities
4. supabase/migration_readiness_dashboard.sql # Readiness scoring
```

**Verify migrations:**
```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Check RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables 
WHERE schemaname = 'public';
```

### 3. Storage Policies

Verify Supabase Storage buckets and policies:

```sql
-- Required buckets
- evidence (for project evidence files)
- studies (for study artifacts)

-- Policies should enforce:
- org/client scoping via folder prefixes
- file type allowlist
- size limits
```

### 4. Run Smoke Tests

**Backend tests:**
```bash
cd /path/to/TaxScapeCursor
python -m pytest tests/test_smoke.py -v

# With coverage
python -m pytest tests/test_smoke.py --cov=app --cov-report=html
```

**Frontend tests:**
```bash
cd frontend
npm run test:smoke

# Or with Playwright
npx playwright test
```

### 5. Manual Smoke Test Checklist

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Login as CPA | Dashboard loads with client selector |
| 2 | Select/create demo client | Demo data seeded, dashboard shows pipeline |
| 3 | Navigate to Projects | Projects table loads |
| 4 | Open project detail | Project form displays |
| 5 | Run AI evaluation | Evaluation completes, results shown |
| 6 | Navigate to Gaps | Gaps list loads |
| 7 | Resolve a gap | Gap status updates to resolved |
| 8 | Generate study | Study PDF/Excel generated |
| 9 | Download audit package | ZIP file downloads |
| 10 | Logout | Session cleared |

### 6. Security Verification

- [ ] CORS configured for production domains only
- [ ] Rate limiting enabled on AI endpoints
- [ ] JWT verification working
- [ ] RLS policies tested with different roles
- [ ] No secrets in client-side code
- [ ] File upload validation working

## Release Steps

### 1. Create Release Branch

```bash
git checkout main
git pull origin main
git checkout -b release/v1.x.x
```

### 2. Update Version Numbers

- Update `app/main.py`: `version="1.x.x"`
- Update `frontend/package.json`: `"version": "1.x.x"`

### 3. Run Full Test Suite

```bash
# Backend
python -m pytest tests/ -v --tb=short

# Frontend
cd frontend && npm run lint && npm run build
```

### 4. Create Git Tag

```bash
git tag -a v1.x.x -m "Release v1.x.x"
git push origin v1.x.x
```

### 5. Deploy

**Backend (Railway/Render):**
- Push to main triggers auto-deploy
- Monitor deployment logs
- Verify health endpoint: `GET /api/system/health`

**Frontend (Vercel):**
- Push to main triggers auto-deploy
- Verify production build succeeds
- Check preview deployment first

### 6. Post-Deploy Verification

```bash
# Check backend health
curl https://your-api.railway.app/api/system/health

# Check frontend loads
curl -I https://taxscape.ai
```

## Rollback Strategy

### Backend Rollback

```bash
# Railway/Render: Revert to previous deployment in dashboard
# Or redeploy previous commit:
git revert HEAD
git push origin main
```

### Database Rollback

**Option 1: Point-in-time recovery (Supabase)**
- Use Supabase dashboard to restore to previous point

**Option 2: Manual rollback scripts**
- Keep rollback SQL scripts for each migration
- Example: `supabase/rollback_readiness_dashboard.sql`

### Frontend Rollback

```bash
# Vercel: Use dashboard to redeploy previous deployment
# Or:
git revert HEAD
git push origin main
```

## Monitoring

### Key Metrics to Watch

1. **API Response Times** - Should be < 500ms for most endpoints
2. **Error Rate** - Should be < 1%
3. **AI Call Success Rate** - Monitor in `/api/system/metrics`
4. **Active Users** - Via Supabase auth dashboard

### Alerts to Configure

- API error rate > 5%
- Response time > 2s
- AI call failures > 10%
- Database connection errors

## Support Runbook

### Common Issues

**Issue: "Failed to authenticate"**
- Check Supabase auth configuration
- Verify JWT tokens are being passed correctly
- Check CORS configuration

**Issue: "Study generation failed"**
- Check AI API key is valid
- Verify sufficient API quota
- Check for missing project data

**Issue: "Realtime not connecting"**
- Verify Supabase realtime is enabled
- Check browser console for WebSocket errors
- Verify auth token is being passed

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | TBD | Initial production release |

---

Last updated: {{ current_date }}

