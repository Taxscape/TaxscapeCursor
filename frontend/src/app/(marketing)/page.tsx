"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { submitDemoRequest } from "@/lib/api";

// Icons as inline SVGs for clean minimalist look
const Icons = {
  robot: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="10" x="3" y="11" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" x2="8" y1="16" y2="16" />
      <line x1="16" x2="16" y1="16" y2="16" />
    </svg>
  ),
  shield: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  fileSpreadsheet: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M8 13h2" />
      <path d="M8 17h2" />
      <path d="M14 13h2" />
      <path d="M14 17h2" />
    </svg>
  ),
  calculator: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="16" height="20" x="4" y="2" rx="2" />
      <line x1="8" x2="16" y1="6" y2="6" />
      <line x1="16" x2="16" y1="14" y2="18" />
      <path d="M16 10h.01" />
      <path d="M12 10h.01" />
      <path d="M8 10h.01" />
      <path d="M12 14h.01" />
      <path d="M8 14h.01" />
      <path d="M12 18h.01" />
      <path d="M8 18h.01" />
    </svg>
  ),
  arrowRight: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  ),
  check: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  play: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
};

// Intersection Observer hook for scroll animations
function useInView(options = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsInView(true);
      }
    }, { threshold: 0.1, ...options });

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return { ref, isInView };
}

// Feature card component
function FeatureCard({ 
  icon, 
  title, 
  description, 
  delay = 0 
}: { 
  icon: React.ReactNode; 
  title: string; 
  description: string; 
  delay?: number;
}) {
  const { ref, isInView } = useInView();
  
  return (
    <div
      ref={ref}
      className={`p-8 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-all duration-500 ${
        isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="w-14 h-14 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-5">
        {icon}
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-3">{title}</h3>
      <p className="text-gray-600 leading-relaxed">{description}</p>
    </div>
  );
}

// Benefit item component
function BenefitItem({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center flex-shrink-0 mt-0.5">
        {Icons.check}
      </div>
      <span className="text-gray-700">{text}</span>
    </div>
  );
}

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const heroRef = useInView();
  const statsRef = useInView();
  const ctaRef = useInView();
  
  // Demo form state
  const [demoForm, setDemoForm] = useState({ name: "", email: "", company: "" });
  const [demoSubmitting, setDemoSubmitting] = useState(false);
  const [demoSuccess, setDemoSuccess] = useState(false);
  const [demoError, setDemoError] = useState("");

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
  
  const handleDemoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!demoForm.name || !demoForm.email) return;
    
    setDemoSubmitting(true);
    setDemoError("");
    
    try {
      await submitDemoRequest(demoForm);
      setDemoSuccess(true);
      setDemoForm({ name: "", email: "", company: "" });
    } catch {
      setDemoError("Something went wrong. Please try again or email us directly.");
    } finally {
      setDemoSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? "bg-white/95 backdrop-blur-md shadow-sm" : "bg-transparent"
        }`}
      >
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-lg">
              T
            </div>
            <span className="text-xl font-semibold text-gray-900">TaxScape</span>
          </Link>
          
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="#demo"
              className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Book a Demo
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div
          ref={heroRef.ref}
          className={`max-w-6xl mx-auto transition-all duration-700 ${
            heroRef.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="max-w-3xl mx-auto text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 text-blue-700 text-sm font-medium mb-6">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              AI-Powered R&D Tax Credit Software
            </div>
            
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight mb-6">
              Maximize Your
              <span className="text-blue-600"> R&D Tax Credits</span>
            </h1>
            
            <p className="text-xl text-gray-600 leading-relaxed mb-10">
              Our AI auditor helps you identify qualifying research activities, 
              calculate credits accurately, and generate IRS-compliant documentation 
              in minutes, not weeks.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="#demo"
                className="w-full sm:w-auto px-8 py-4 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all hover:shadow-lg hover:shadow-blue-600/25 flex items-center justify-center gap-2"
              >
                Book a Demo
                {Icons.arrowRight}
              </Link>
              <Link
                href="/portal"
                className="w-full sm:w-auto px-8 py-4 bg-gray-100 text-gray-900 font-semibold rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
              >
                Sign In to Portal
              </Link>
            </div>
          </div>

          {/* Product Preview */}
          <div className="relative max-w-5xl mx-auto">
            <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent z-10 pointer-events-none h-full" />
            <div className="rounded-2xl overflow-hidden shadow-2xl shadow-gray-900/10 border border-gray-200">
              <div className="bg-gray-100 px-4 py-3 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="flex-1 text-center">
                  <span className="text-xs text-gray-500">TaxScape Pro Dashboard</span>
                </div>
              </div>
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-8 min-h-[300px] flex items-center justify-center">
                <div className="grid grid-cols-3 gap-6 w-full max-w-2xl">
                  <div className="bg-white rounded-xl p-6 shadow-sm">
                    <div className="text-sm text-gray-500 mb-1">R&D Credit</div>
                    <div className="text-2xl font-bold text-gray-900">$127,500</div>
                    <div className="text-xs text-green-600 mt-1">+12% from last year</div>
                  </div>
                  <div className="bg-white rounded-xl p-6 shadow-sm">
                    <div className="text-sm text-gray-500 mb-1">Total QRE</div>
                    <div className="text-2xl font-bold text-gray-900">$1.96M</div>
                    <div className="text-xs text-gray-500 mt-1">Qualified expenses</div>
                  </div>
                  <div className="bg-white rounded-xl p-6 shadow-sm">
                    <div className="text-sm text-gray-500 mb-1">Projects</div>
                    <div className="text-2xl font-bold text-gray-900">8</div>
                    <div className="text-xs text-blue-600 mt-1">All qualified</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-gray-50">
        <div
          ref={statsRef.ref}
          className={`max-w-6xl mx-auto px-6 transition-all duration-700 ${
            statsRef.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { value: "$50M+", label: "Credits Identified" },
              { value: "500+", label: "Studies Generated" },
              { value: "98%", label: "IRS Acceptance Rate" },
              { value: "10x", label: "Faster Than Manual" },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-4xl font-bold text-gray-900 mb-2">{stat.value}</div>
                <div className="text-gray-600">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Everything You Need for R&D Tax Credits
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              From project qualification to IRS-ready documentation, 
              our platform handles the entire process.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={Icons.robot}
              title="AI-Powered Auditor"
              description="Our intelligent chatbot interviews you about your projects, identifying qualifying R&D activities using the IRS 4-part test automatically."
              delay={0}
            />
            <FeatureCard
              icon={Icons.shield}
              title="IRS Compliance"
              description="Generate audit-ready documentation that meets Section 41 requirements. Every calculation is backed by defensible methodology."
              delay={100}
            />
            <FeatureCard
              icon={Icons.fileSpreadsheet}
              title="Instant Excel Reports"
              description="Export comprehensive R&D studies with wage allocations, contractor QREs, and Section 174 amortization schedules in one click."
              delay={200}
            />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Simple 3-Step Process
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Get your R&D tax credit study done in minutes, not months.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Upload Your Data",
                description: "Import your payroll data and contractor invoices. Our system automatically identifies R&D-eligible expenses.",
              },
              {
                step: "02",
                title: "Chat with AI Auditor",
                description: "Describe your projects to our AI. It asks the right questions to establish technical uncertainty and experimentation.",
              },
              {
                step: "03",
                title: "Generate Study",
                description: "Download your complete R&D tax credit study with all calculations, documentation, and IRS-ready forms.",
              },
            ].map((item, i) => {
              const { ref, isInView } = useInView();
              return (
                <div
                  key={i}
                  ref={ref}
                  className={`relative transition-all duration-500 ${
                    isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                  }`}
                  style={{ transitionDelay: `${i * 100}ms` }}
                >
                  <div className="text-7xl font-bold text-gray-100 mb-4">{item.step}</div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">{item.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{item.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
                Why Companies Choose TaxScape
              </h2>
              <p className="text-xl text-gray-600 mb-8">
                We&apos;ve helped hundreds of companies maximize their R&D credits 
                while ensuring full IRS compliance.
              </p>
              
              <div className="space-y-4">
                <BenefitItem text="Save 80% of time compared to manual studies" />
                <BenefitItem text="Identify credits you might be missing" />
                <BenefitItem text="IRS-defensible documentation every time" />
                <BenefitItem text="Expert support when you need it" />
                <BenefitItem text="Section 174 amortization calculations included" />
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-8 text-white">
              <div className="text-blue-200 text-sm font-medium mb-4">TESTIMONIAL</div>
              <blockquote className="text-xl leading-relaxed mb-6">
                &ldquo;TaxScape identified $85,000 in additional R&D credits we would have 
                missed. The AI auditor made documenting our projects incredibly easy.&rdquo;
              </blockquote>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center font-semibold">
                  JD
                </div>
                <div>
                  <div className="font-semibold">James Davidson</div>
                  <div className="text-blue-200 text-sm">CTO, TechStart Inc.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section id="demo" className="py-24 px-6 bg-gray-900">
        <div
          ref={ctaRef.ref}
          className={`max-w-4xl mx-auto text-center transition-all duration-700 ${
            ctaRef.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Ready to Maximize Your R&D Credits?
          </h2>
          <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
            Schedule a personalized demo to see how TaxScape can help your company 
            identify and document R&D tax credits.
          </p>
          
          {/* Demo Request Form */}
          <div className="bg-gray-800 rounded-2xl p-8 max-w-lg mx-auto">
            {demoSuccess ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">Thank you!</h3>
                <p className="text-gray-400">
                  We&apos;ll contact you shortly to schedule your personalized demo.
                </p>
                <button
                  onClick={() => setDemoSuccess(false)}
                  className="mt-6 text-blue-400 hover:underline text-sm"
                >
                  Submit another request
                </button>
              </div>
            ) : (
              <>
                <div className="text-gray-400 mb-6">
                  Book a 30-minute demo with our team
                </div>
                
                <form className="space-y-4" onSubmit={handleDemoSubmit}>
                  {demoError && (
                    <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-sm">
                      {demoError}
                    </div>
                  )}
                  <input
                    type="text"
                    placeholder="Your Name"
                    value={demoForm.name}
                    onChange={(e) => setDemoForm(f => ({ ...f, name: e.target.value }))}
                    required
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="email"
                    placeholder="Work Email"
                    value={demoForm.email}
                    onChange={(e) => setDemoForm(f => ({ ...f, email: e.target.value }))}
                    required
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    placeholder="Company Name (optional)"
                    value={demoForm.company}
                    onChange={(e) => setDemoForm(f => ({ ...f, company: e.target.value }))}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={demoSubmitting}
                    className="w-full py-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {demoSubmitting ? "Submitting..." : "Request Demo"}
                  </button>
                </form>
                
                <p className="text-gray-500 text-sm mt-4">
                  Or email us directly at{" "}
                  <a href="mailto:demo@taxscape.com" className="text-blue-400 hover:underline">
                    demo@taxscape.com
                  </a>
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 bg-gray-950">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
                T
              </div>
              <span className="text-lg font-semibold text-white">TaxScape</span>
            </div>
            
            <div className="flex items-center gap-8 text-sm text-gray-400">
              <Link href="/portal" className="hover:text-white transition-colors">
                Portal
              </Link>
              <Link href="#" className="hover:text-white transition-colors">
                Privacy Policy
              </Link>
              <Link href="#" className="hover:text-white transition-colors">
                Terms of Service
              </Link>
              <a href="mailto:contact@taxscape.com" className="hover:text-white transition-colors">
                Contact
              </a>
            </div>
          </div>
          
          <div className="mt-8 pt-8 border-t border-gray-800 text-center text-sm text-gray-500">
            &copy; {new Date().getFullYear()} TaxScape Pro. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

