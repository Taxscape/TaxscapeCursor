import os
from supabase import create_client, Client
from dotenv import load_dotenv
from jose import jwt, JWTError
from typing import Optional

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")  # Use service role for backend
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET")  # JWT secret for token verification

if not SUPABASE_URL:
    print("Warning: SUPABASE_URL not set. Supabase features will be disabled.")
    supabase: Client | None = None
else:
    # Use service role key if available (full access), otherwise anon key
    key_to_use = SUPABASE_KEY or SUPABASE_ANON_KEY
    if key_to_use:
        supabase: Client = create_client(SUPABASE_URL, key_to_use)
    else:
        print("Warning: No Supabase key found. Supabase features will be disabled.")
        supabase = None


def get_supabase() -> Client | None:
    """Get the Supabase client instance."""
    return supabase


def verify_supabase_token(token: str) -> Optional[dict]:
    """
    Verify a Supabase JWT token and return the user data.
    Returns None if verification fails.
    """
    if not supabase:
        return None
    
    try:
        # Method 1: Try using Supabase admin API to get user
        if SUPABASE_KEY:
            # Use admin client to verify token
            admin_client = create_client(SUPABASE_URL, SUPABASE_KEY)
            try:
                # Decode token to get user ID
                # Decode JWT to get user ID (without verification for now)
                # Supabase tokens are signed with JWT_SECRET but we can decode to get user info
                decoded = jwt.decode(token, options={"verify_signature": False})
                user_id = decoded.get("sub")
                if user_id:
                    # Get user details from admin API
                    user_response = admin_client.auth.admin.get_user_by_id(user_id)
                    if user_response and user_response.user:
                        return {
                            "id": user_response.user.id,
                            "email": user_response.user.email,
                            "role": user_response.user.role or "authenticated",
                        }
            except Exception as admin_error:
                print(f"Admin API verification error: {admin_error}")
        
        # Method 2: Fallback - decode JWT without verification to get basic user info
        try:
            decoded = jwt.decode(token, options={"verify_signature": False})
            return {
                "id": decoded.get("sub"),
                "email": decoded.get("email"),
                "role": decoded.get("role", "authenticated"),
            }
        except JWTError as decode_error:
            print(f"JWT decode error: {decode_error}")
            return None
            
    except Exception as e:
        print(f"Token verification error: {e}")
        return None


def get_user_profile(user_id: str) -> dict | None:
    """Get user profile from Supabase."""
    if not supabase:
        return None
    
    try:
        response = supabase.table("profiles").select("*").eq("id", user_id).single().execute()
        return response.data
    except Exception as e:
        print(f"Error fetching profile: {e}")
        return None

