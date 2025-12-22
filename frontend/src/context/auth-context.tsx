"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User, Session, AuthChangeEvent, EmailOtpType } from "@supabase/supabase-js";
import { getSupabaseClient, Profile, Organization, OrganizationMember } from "@/lib/supabase";

export type UserRole = 'admin' | 'project_lead' | 'vendor_approver' | 'supply_approver' | 'hr_verifier' | 'member';

type AuthContextType = {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  organization: Organization | null;
  userRole: UserRole | null;
  isLoading: boolean;
  isAdmin: boolean;
  isOrgAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string, companyName: string) => Promise<{ error: Error | null; needsVerification: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshOrganization: () => Promise<void>;
  verifyOtp: (email: string, token: string, type?: EmailOtpType) => Promise<{ error: Error | null }>;
  resendOtp: (email: string) => Promise<{ error: Error | null }>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = getSupabaseClient();

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("Error fetching profile:", error);
      return null;
    }
    return data as Profile;
  }, [supabase]);

  const fetchOrganization = useCallback(async (orgId: string, userId: string) => {
    try {
      // Fetch organization
      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", orgId)
        .single();

      if (orgError) {
        console.error("Error fetching organization:", orgError);
        return { organization: null, role: null };
      }

      // Fetch member role
      const { data: memberData, error: memberError } = await supabase
        .from("organization_members")
        .select("role, status")
        .eq("organization_id", orgId)
        .eq("user_id", userId)
        .single();

      if (memberError) {
        console.error("Error fetching member role:", memberError);
        // User might be the creator without a member record yet
        return { organization: orgData as Organization, role: 'admin' as UserRole };
      }

      return {
        organization: orgData as Organization,
        role: memberData?.status === 'active' ? (memberData.role as UserRole) : null
      };
    } catch (e) {
      console.error("Error in fetchOrganization:", e);
      return { organization: null, role: null };
    }
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (user) {
      const profileData = await fetchProfile(user.id);
      setProfile(profileData);
      
      // Also refresh organization if profile has one
      if (profileData?.organization_id) {
        const { organization: org, role } = await fetchOrganization(profileData.organization_id, user.id);
        setOrganization(org);
        setUserRole(role);
      }
    }
  }, [user, fetchProfile, fetchOrganization]);

  const refreshOrganization = useCallback(async () => {
    if (user && profile?.organization_id) {
      const { organization: org, role } = await fetchOrganization(profile.organization_id, user.id);
      setOrganization(org);
      setUserRole(role);
    }
  }, [user, profile, fetchOrganization]);

  useEffect(() => {
    console.log('[Auth] Setting up auth listener...');
    
    // Set up auth state change listener FIRST - this is the primary way to get session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, currentSession: Session | null) => {
        console.log('[Auth] Auth state changed:', event, currentSession?.user?.email);
        
        // Update session and user immediately (don't block on profile fetch)
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        setIsLoading(false);

        // Fetch profile and organization in the background (don't await)
        if (currentSession?.user) {
          fetchProfile(currentSession.user.id)
            .then(profileData => {
              setProfile(profileData);
              
              // Fetch organization if user has one
              if (profileData?.organization_id) {
                fetchOrganization(profileData.organization_id, currentSession.user.id)
                  .then(({ organization: org, role }) => {
                    setOrganization(org);
                    setUserRole(role);
                  })
                  .catch(err => console.error('[Auth] Organization fetch error:', err));
              } else {
                setOrganization(null);
                setUserRole(null);
              }
            })
            .catch(err => console.error('[Auth] Profile fetch error:', err));
        } else {
          setProfile(null);
          setOrganization(null);
          setUserRole(null);
        }
      }
    );

    // Then check for existing session (this will trigger onAuthStateChange if session exists)
    const initAuth = async () => {
      console.log('[Auth] Checking for existing session...');
      try {
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('[Auth] Error getting session:', error);
          setIsLoading(false);
          return;
        }
        
        // If no session found via getSession, onAuthStateChange might not fire
        // so we need to set loading to false manually
        if (!initialSession) {
          console.log('[Auth] No existing session found');
          setIsLoading(false);
        } else {
          console.log('[Auth] Found existing session for:', initialSession.user.email);
          // onAuthStateChange should handle this, but set it directly too for reliability
          setSession(initialSession);
          setUser(initialSession.user);
          setIsLoading(false);
          
          // Fetch profile and organization in background (don't block)
          fetchProfile(initialSession.user.id)
            .then(profileData => {
              setProfile(profileData);
              
              if (profileData?.organization_id) {
                fetchOrganization(profileData.organization_id, initialSession.user.id)
                  .then(({ organization: org, role }) => {
                    setOrganization(org);
                    setUserRole(role);
                  })
                  .catch(err => console.error('[Auth] Organization fetch error:', err));
              }
            })
            .catch(err => console.error('[Auth] Profile fetch error:', err));
        }
      } catch (e) {
        console.error('[Auth] Init error:', e);
        setIsLoading(false);
      }
    };

    initAuth();

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile, fetchOrganization]);

  const signIn = async (email: string, password: string) => {
    console.log('[Auth] Attempting sign in for:', email);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      console.log('[Auth] Sign in result:', { success: !!data?.session, error: error?.message });
      return { error: error as Error | null };
    } catch (e) {
      console.error('[Auth] Sign in exception:', e);
      return { error: e as Error };
    }
  };

  const signUp = async (email: string, password: string, fullName: string, companyName: string) => {
    console.log('[Auth] Attempting sign up for:', email);
    // Sign up with email - Supabase will send OTP code
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            company_name: companyName,
          },
          // Don't set emailRedirectTo to use OTP instead of magic link
          // Note: This requires Supabase to be configured for OTP in the dashboard
        },
      });

      console.log('[Auth] Sign up result:', { 
        hasUser: !!data.user, 
        hasSession: !!data.session, 
        error: error?.message 
      });

      if (error) {
        return { error: error as Error, needsVerification: false };
      }

      // Check if user needs email verification (no session means email not confirmed)
      const needsVerification = data.user && !data.session;

      // If user is already confirmed (has session), update profile immediately
      if (data.user && data.session) {
        console.log('[Auth] User already verified, updating profile');
        try {
          await supabase
            .from("profiles")
            .update({ company_name: companyName, full_name: fullName })
            .eq("id", data.user.id);
        } catch (profileError) {
          console.error("Error updating profile:", profileError);
        }
      }

      return { error: null, needsVerification: needsVerification ?? false };
    } catch (err) {
      console.error('[Auth] Sign up exception:', err);
      return { error: err as Error, needsVerification: false };
    }
  };

  const verifyOtp = async (email: string, token: string, type: EmailOtpType = "signup") => {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type,
    });

    // If verification successful and we have user data, update profile
    if (!error && data.user) {
      const metadata = data.user.user_metadata;
      if (metadata?.company_name || metadata?.full_name) {
        await supabase
          .from("profiles")
          .update({ 
            company_name: metadata.company_name, 
            full_name: metadata.full_name 
          })
          .eq("id", data.user.id);
      }
    }

    return { error: error as Error | null };
  };

  const resendOtp = async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
    setOrganization(null);
    setUserRole(null);
  };

  const value = {
    user,
    profile,
    session,
    organization,
    userRole,
    isLoading,
    isAdmin: profile?.is_admin ?? false,
    isOrgAdmin: userRole === 'admin',
    signIn,
    signUp,
    signOut,
    refreshProfile,
    refreshOrganization,
    verifyOtp,
    resendOtp,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
