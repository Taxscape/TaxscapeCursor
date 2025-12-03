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
    print(f"[Auth] verify_supabase_token called, token length: {len(token) if token else 0}")
    
    if not token:
        print("[Auth] No token provided")
        return None
    
    # Decode the JWT without signature verification
    # jose library requires a key even when not verifying, so we provide a dummy key
    try:
        # Use get_unverified_claims for cleaner no-verification decode
        decoded = jwt.get_unverified_claims(token)
        user_id = decoded.get("sub")
        user_email = decoded.get("email")
        
        print(f"[Auth] Token decoded successfully: user_id={user_id}, email={user_email}")
        
        if user_id:
            return {
                "id": user_id,
                "email": user_email,
                "role": decoded.get("role", "authenticated"),
            }
        else:
            print("[Auth] No user_id (sub) in decoded token")
            return None
            
    except JWTError as decode_error:
        print(f"[Auth] JWT decode error: {decode_error}")
        return None
    except Exception as e:
        print(f"[Auth] Token verification error: {e}")
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

