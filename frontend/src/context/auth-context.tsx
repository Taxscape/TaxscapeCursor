"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User, Session, AuthChangeEvent, EmailOtpType } from "@supabase/supabase-js";
import { getSupabaseClient, Profile } from "@/lib/supabase";

type AuthContextType = {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  isLoading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string, companyName: string) => Promise<{ error: Error | null; needsVerification: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  verifyOtp: (email: string, token: string, type?: EmailOtpType) => Promise<{ error: Error | null }>;
  resendOtp: (email: string) => Promise<{ error: Error | null }>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
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

  const refreshProfile = useCallback(async () => {
    if (user) {
      const profileData = await fetchProfile(user.id);
      setProfile(profileData);
    }
  }, [user, fetchProfile]);

  useEffect(() => {
    // Get initial session
    const initAuth = async () => {
      const { data: { session: initialSession } } = await supabase.auth.getSession();
      
      if (initialSession) {
        setSession(initialSession);
        setUser(initialSession.user);
        const profileData = await fetchProfile(initialSession.user.id);
        setProfile(profileData);
      }
      
      setIsLoading(false);
    };

    initAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event: AuthChangeEvent, currentSession: Session | null) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user) {
          const profileData = await fetchProfile(currentSession.user.id);
          setProfile(profileData);
        } else {
          setProfile(null);
        }

        setIsLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName: string, companyName: string) => {
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

      if (error) {
        return { error: error as Error, needsVerification: false };
      }

      // Check if user needs email verification (no session means email not confirmed)
      const needsVerification = data.user && !data.session;

      // If user is already confirmed (has session), update profile immediately
      if (data.user && data.session) {
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
  };

  const value = {
    user,
    profile,
    session,
    isLoading,
    isAdmin: profile?.is_admin ?? false,
    signIn,
    signUp,
    signOut,
    refreshProfile,
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
