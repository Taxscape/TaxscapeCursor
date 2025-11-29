import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")  # Use service role for backend
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

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


def verify_supabase_token(token: str) -> dict | None:
    """
    Verify a Supabase JWT token and return the user data.
    Returns None if verification fails.
    """
    if not supabase:
        return None
    
    try:
        # Get user from token
        user_response = supabase.auth.get_user(token)
        if user_response and user_response.user:
            return {
                "id": user_response.user.id,
                "email": user_response.user.email,
                "role": user_response.user.role,
            }
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

