"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { getOrganizationBySlug, type Organization } from "@/lib/api";

type Step = "register" | "verify";
type RegisterMode = "create_org" | "join_org";

export default function RegisterPage() {
  const [step, setStep] = useState<Step>("register");
  const [mode, setMode] = useState<RegisterMode>("create_org");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [orgContext, setOrgContext] = useState<Organization | null>(null);
  const [loadingOrg, setLoadingOrg] = useState(true);
  const router = useRouter();
  const { signUp, verifyOtp, resendOtp } = useAuth();

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
          if (org) {
            setOrgContext(org);
            setMode("join_org");
            // Pre-fill company name
            setCompanyName(org.name);
          }
        }
      } catch (e) {
        console.error("Error loading org context:", e);
      } finally {
        setLoadingOrg(false);
      }
    };
    
    checkOrgContext();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setIsLoading(true);

    // If joining an org via subdomain, don't pass company name (it won't create a new org)
    // The backend will need to handle this - for now we still pass it but the invite flow
    // should add them to the existing org
    const companyToUse = mode === "join_org" ? "" : companyName;
    
    const { error: signUpError, needsVerification } = await signUp(
      email, 
      password, 
      fullName, 
      companyToUse
    );

    if (signUpError) {
      setError(signUpError.message);
      setIsLoading(false);
      return;
    }

    setIsLoading(false);

    // TEMPORARILY DISABLED: Email verification step
    // When re-enabling, uncomment the needsVerification check below
    // if (needsVerification) {
    //   setStep("verify");
    //   startResendCooldown();
    // } else {
    //   router.push("/portal");
    //   router.refresh();
    // }
    
    // For now, go directly to portal
    router.push("/portal");
    router.refresh();
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (otpCode.length !== 6) {
      setError("Please enter the 6-digit code from your email");
      return;
    }

    setIsLoading(true);

    const { error: verifyError } = await verifyOtp(email, otpCode, "signup");

    if (verifyError) {
      setError(verifyError.message);
      setIsLoading(false);
      return;
    }

    // Success - redirect to portal
    router.push("/portal");
    router.refresh();
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;

    setError(null);
    const { error: resendError } = await resendOtp(email);

    if (resendError) {
      setError(resendError.message);
      return;
    }

    startResendCooldown();
  };

  const startResendCooldown = () => {
    setResendCooldown(60);
    const interval = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // OTP Verification Screen
  if (step === "verify") {
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
            <h1 className="text-xl font-semibold text-foreground">Verify your email</h1>
            <p className="text-muted-foreground mt-1">
              We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>
            </p>
          </div>

          {/* Verification Card */}
          <div className="bg-card rounded-2xl border border-border p-8 shadow-soft">
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="otpCode" className="block text-sm font-medium mb-2">
                  Verification Code
                </label>
                <input
                  id="otpCode"
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  maxLength={6}
                  className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground text-center text-2xl tracking-[0.5em] font-mono placeholder:text-muted-foreground placeholder:tracking-normal placeholder:text-base focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="000000"
                  autoComplete="one-time-code"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || otpCode.length !== 6}
                className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? "Verifying..." : "Verify Email"}
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                Didn&apos;t receive the code?{" "}
                {resendCooldown > 0 ? (
                  <span className="text-muted-foreground">Resend in {resendCooldown}s</span>
                ) : (
                  <button
                    onClick={handleResendCode}
                    className="text-primary hover:underline font-medium"
                  >
                    Resend code
                  </button>
                )}
              </p>
            </div>

            <div className="mt-4 text-center">
              <button
                onClick={() => setStep("register")}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                ← Back to registration
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Registration Form
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
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
                Join {orgContext.name}
              </h1>
              <p className="text-muted-foreground mt-1">
                Create your account to access the verification portal
              </p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-foreground">Create your account</h1>
              <p className="text-muted-foreground mt-1">Start maximizing your R&D tax credits</p>
            </>
          )}
        </div>

        {/* Organization Badge */}
        {orgContext && (
          <div className="mb-6 p-3 rounded-lg bg-accent/30 border border-accent text-center">
            <p className="text-sm text-muted-foreground">
              You&apos;re joining organization
            </p>
            <p className="font-semibold text-foreground">{orgContext.name}</p>
          </div>
        )}

        {/* Form Card */}
        <div className="bg-card rounded-2xl border border-border p-8 shadow-soft">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                {error}
              </div>
            )}

            {/* Show different form based on mode */}
            {mode === "join_org" ? (
              // Joining existing org - just name field
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium mb-2">
                  Full Name
                </label>
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="John Doe"
                />
              </div>
            ) : (
              // Creating new org - name and company
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="fullName" className="block text-sm font-medium mb-2">
                    Full Name
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label htmlFor="companyName" className="block text-sm font-medium mb-2">
                    Company
                  </label>
                  <input
                    id="companyName"
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="Acme Inc"
                  />
                </div>
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

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-2"
            >
              {isLoading 
                ? "Creating account..." 
                : mode === "join_org" 
                  ? `Join ${orgContext?.name || "Organization"}`
                  : "Create account"
              }
            </button>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">Already have an account? </span>
            <Link href="/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-muted-foreground">
          By creating an account, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
