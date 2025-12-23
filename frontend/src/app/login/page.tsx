"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { getOrganizationBySlug, type Organization } from "@/lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [orgContext, setOrgContext] = useState<Organization | null>(null);
  const [loadingOrg, setLoadingOrg] = useState(true);
  const router = useRouter();
  const { signIn, user, isLoading: authLoading } = useAuth();

  // Check for org subdomain context
  useEffect(() => {
    const checkOrgContext = async () => {
      try {
        // Get org slug from cookie (set by middleware)
        const cookies = document.cookie.split(';');
        const orgSlugCookie = cookies.find(c => c.trim().startsWith('org-slug='));
        const orgSlug = orgSlugCookie?.split('=')[1]?.trim();
        
        if (orgSlug) {
          const org = await getOrganizationBySlug(orgSlug);
          setOrgContext(org);
        }
      } catch (e) {
        console.error("Error loading org context:", e);
      } finally {
        setLoadingOrg(false);
      }
    };
    
    checkOrgContext();
  }, []);

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      router.push("/portal");
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const { error: signInError } = await signIn(email, password);

      if (signInError) {
        setError(signInError.message);
        setIsLoading(false);
        return;
      }

      // Wait a moment for auth state to update, then redirect
      // The useEffect above will handle the actual redirect once user is set
      setTimeout(() => {
        router.push("/portal");
        router.refresh();
      }, 500);
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold">
              T
            </div>
            <span className="text-2xl font-semibold">TaxScape Pro</span>
          </div>
          
          {/* Show org context if on subdomain */}
          {!loadingOrg && orgContext ? (
            <>
              <h1 className="text-xl font-semibold text-foreground">
                Sign in to {orgContext.name}
              </h1>
              <p className="text-muted-foreground mt-1">
                Enter your credentials to access the portal
              </p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-foreground">Welcome back</h1>
              <p className="text-muted-foreground mt-1">Sign in to your account</p>
            </>
          )}
        </div>

        {/* Organization Badge */}
        {orgContext && (
          <div className="mb-6 p-3 rounded-lg bg-accent/30 border border-accent text-center">
            <p className="text-sm text-muted-foreground">
              Signing in to organization
            </p>
            <p className="font-semibold text-foreground">{orgContext.name}</p>
          </div>
        )}

        {/* Form Card */}
        <div className="bg-card rounded-2xl border border-border p-8 shadow-soft">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">Don&apos;t have an account? </span>
            <Link href="/register" className="text-primary hover:underline font-medium">
              Sign up
            </Link>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-muted-foreground">
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
