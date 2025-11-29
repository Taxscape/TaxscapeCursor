# Login Troubleshooting Guide

## Quick Fix Summary

The login flow has been improved with better error handling. Here's what was fixed:

1. **Better error messages**: Login now shows actual backend error messages instead of generic "Invalid credentials"
2. **Improved error handling**: Both register and login endpoints now have proper try/catch blocks
3. **Token expiration**: Fixed to use the configured 300-minute expiration instead of defaulting to 15 minutes
4. **Content-Type header**: Explicitly set for login form data submission

## Testing the Login Flow

### Step 1: Verify Backend is Running
```bash
curl http://localhost:8001/docs
```
Should show FastAPI Swagger UI.

### Step 2: Register a New User
1. Go to `http://localhost:3000/register`
2. Fill in:
   - Firm/Client Name: `Test Company`
   - Email: `test@example.com`
   - Password: `password123`
3. Click "Create Firm Workspace"
4. Should redirect to login page after success

### Step 3: Login
1. Go to `http://localhost:3000/login`
2. Enter the same email and password
3. Should redirect to `/dashboard`

## Common Issues

### "Unable to reach the TaxScape API"
- **Cause**: Backend not running or wrong URL
- **Fix**: Run `./run_local.sh` from project root, or manually start backend:
  ```bash
  source venv/bin/activate
  uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
  ```

### "Incorrect email or password"
- **Cause**: User doesn't exist or wrong password
- **Fix**: Register first at `/register`, then try logging in

### "Email already registered"
- **Cause**: User already exists
- **Fix**: Use a different email or login with existing credentials

### CORS Errors (in browser console)
- **Cause**: Frontend URL not in allowed origins
- **Fix**: Check `app/main.py` has your frontend URL in `allowed_origins` list

## Debugging

### Check Backend Logs
Look at the terminal where `uvicorn` is running for error messages.

### Check Frontend Console
Open browser DevTools (F12) → Console tab to see detailed error messages.

### Test API Directly
```bash
# Register
curl -X POST http://localhost:8001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123","company_name":"Test Co"}'

# Login
curl -X POST http://localhost:8001/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=test@test.com&password=test123"
```

## What Was Fixed

1. **`frontend/src/lib/api.ts`**:
   - Added explicit Content-Type header for login
   - Better error parsing to show actual backend error messages
   - Network error detection with helpful message

2. **`app/main.py`**:
   - Improved error handling in login endpoint
   - Proper HTTP status codes (401 for auth failures)
   - Better exception handling with rollback on register errors

3. **`app/auth.py`**:
   - Fixed token expiration to use configured 300 minutes

4. **Frontend pages**:
   - Added console.error logging for debugging
   - Better error message display

## Next Steps

If login still doesn't work:
1. Check browser console for specific error messages
2. Check backend terminal for Python tracebacks
3. Verify database file exists: `ls -la tax_study.db`
4. Try registering a fresh user with a new email

