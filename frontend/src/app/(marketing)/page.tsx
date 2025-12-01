"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { submitDemoRequest } from "@/lib/api";

// Demo Form Component
function DemoForm() {
  const [formData, setFormData] = useState({ name: "", email: "", company: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      await submitDemoRequest(formData);
      setSubmitted(true);
    } catch (err) {
      setError("Something went wrong. Please try again.");
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-600">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Thank You!</h3>
        <p className="text-gray-600">We&apos;ll be in touch within 24 hours to schedule your demo.</p>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Your Name"
        required
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      <input
        type="email"
        placeholder="Work Email"
        required
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      <input
        type="text"
        placeholder="Company Name"
        value={formData.company}
        onChange={(e) => setFormData({ ...formData, company: e.target.value })}
        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? "Submitting..." : "Request Demo"}
      </button>
    </form>
  );
}

// Intersection Observer hook for scroll animations
function useInView() {
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsInView(true);
      }
    }, { threshold: 0.1 });

    const currentRef = ref.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
      observer.disconnect();
    };
  }, []);

  return { ref, isInView };
}

// Icons
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
  calendar: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </svg>
  ),
  sparkles: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  ),
};

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const featuresRef = useInView();
  const benefitsRef = useInView();
  const ctaRef = useInView();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? "bg-white/95 backdrop-blur-md shadow-sm" : "bg-transparent"
        }`}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
              T
            </div>
            <span className="font-semibold text-gray-900">TaxScape</span>
          </Link>

          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="#demo"
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Book a Demo
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm font-medium mb-6">
              {Icons.sparkles}
              AI-Powered R&D Tax Credit Analysis
            </div>

            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight mb-6">
              Maximize Your
              <br />
              <span className="text-blue-600">R&D Tax Credits</span>
            </h1>

            <p className="text-xl text-gray-600 mb-10 leading-relaxed">
              Our AI auditor validates your projects against IRS Section 41 requirements
              and generates compliant documentation in minutes, not weeks.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="#demo"
                className="w-full sm:w-auto px-8 py-4 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-all hover:shadow-lg hover:shadow-blue-600/25 flex items-center justify-center gap-2"
              >
                Book a Demo
                {Icons.arrowRight}
              </Link>
              <Link
                href="/portal"
                className="w-full sm:w-auto px-8 py-4 bg-gray-100 text-gray-900 font-medium rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
              >
                Go to Portal
              </Link>
            </div>
          </div>

          {/* Hero Image/Dashboard Preview */}
          <div className="mt-16 relative">
            <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent z-10 pointer-events-none" />
            <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl p-2 shadow-2xl shadow-gray-300/50">
              <div className="bg-white rounded-xl overflow-hidden border border-gray-200">
                <div className="h-8 bg-gray-100 flex items-center px-4 gap-2 border-b border-gray-200">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="p-6 bg-gradient-to-br from-gray-50 to-white min-h-[300px] flex items-center justify-center">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-2xl">
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                      <p className="text-xs text-gray-500 mb-1">R&D Credit</p>
                      <p className="text-2xl font-bold text-gray-900">$127K</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                      <p className="text-xs text-gray-500 mb-1">Total QRE</p>
                      <p className="text-2xl font-bold text-gray-900">$1.9M</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                      <p className="text-xs text-gray-500 mb-1">Employees</p>
                      <p className="text-2xl font-bold text-gray-900">47</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                      <p className="text-xs text-gray-500 mb-1">Projects</p>
                      <p className="text-2xl font-bold text-gray-900">12</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 px-6 bg-gray-50" ref={featuresRef.ref}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Everything You Need to Claim Your Credits
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              From initial project qualification to IRS-ready documentation, 
              TaxScape handles the entire R&D tax credit process.
            </p>
          </div>

          <div
            className={`grid md:grid-cols-3 gap-8 transition-all duration-700 ${
              featuresRef.isInView
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-8"
            }`}
          >
            {/* Feature 1 */}
            <div className="bg-white p-8 rounded-2xl border border-gray-200 hover:shadow-lg hover:shadow-gray-200/50 transition-all">
              <div className="w-14 h-14 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mb-6">
                {Icons.robot}
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                AI Tax Auditor
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Our AI conducts thorough interviews to validate your projects against 
                the IRS Four-Part Test, ensuring every qualified activity is captured.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-white p-8 rounded-2xl border border-gray-200 hover:shadow-lg hover:shadow-gray-200/50 transition-all">
              <div className="w-14 h-14 rounded-xl bg-green-100 text-green-600 flex items-center justify-center mb-6">
                {Icons.shield}
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                IRS Compliant
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Generate audit-ready documentation that meets IRS Section 41 and 
                Section 174 requirements. Defensible calculations, every time.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-white p-8 rounded-2xl border border-gray-200 hover:shadow-lg hover:shadow-gray-200/50 transition-all">
              <div className="w-14 h-14 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center mb-6">
                {Icons.fileSpreadsheet}
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Excel Reports
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Export comprehensive Excel studies with QRE calculations, 
                Section 280C analysis, and 174 amortization schedules.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-24 px-6" ref={benefitsRef.ref}>
        <div className="max-w-6xl mx-auto">
          <div
            className={`grid md:grid-cols-2 gap-16 items-center transition-all duration-700 ${
              benefitsRef.isInView
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-8"
            }`}
          >
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
                Stop Leaving Money on the Table
              </h2>
              <p className="text-lg text-gray-600 mb-8">
                Most companies miss 20-40% of their eligible R&D tax credits due to 
                incomplete documentation or misunderstanding of the Four-Part Test.
              </p>

              <ul className="space-y-4">
                {[
                  "Identify all qualified research activities",
                  "Calculate wages, supplies, and contractor QREs",
                  "Generate contemporaneous documentation",
                  "Prepare for IRS audits with confidence",
                ].map((benefit, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                      {Icons.check}
                    </div>
                    <span className="text-gray-700">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-8 rounded-2xl text-white">
              <div className="text-5xl font-bold mb-2">6.5%</div>
              <div className="text-blue-200 mb-6">Average Credit Rate</div>
              <div className="space-y-4 text-sm">
                <div className="flex justify-between border-b border-blue-500/30 pb-3">
                  <span className="text-blue-200">Qualified Wages</span>
                  <span className="font-medium">100% of QRE</span>
                </div>
                <div className="flex justify-between border-b border-blue-500/30 pb-3">
                  <span className="text-blue-200">Contract Research</span>
                  <span className="font-medium">65% of QRE</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-200">Supplies</span>
                  <span className="font-medium">100% of QRE</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-16 px-6 bg-gray-50 border-y border-gray-200">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-sm text-gray-500 uppercase tracking-wide mb-8">
            Trusted by innovative companies
          </p>
          <div className="flex flex-wrap items-center justify-center gap-12 opacity-50">
            {["TechCorp", "InnovateLab", "DevStudio", "CloudBase", "DataFlow"].map(
              (company) => (
                <div key={company} className="text-xl font-semibold text-gray-400">
                  {company}
                </div>
              )
            )}
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <blockquote className="text-2xl md:text-3xl font-medium text-gray-900 leading-relaxed mb-8">
            &ldquo;TaxScape identified $180,000 in R&D credits we would have missed. 
            The AI auditor made the qualification process painless and the 
            documentation is bulletproof.&rdquo;
          </blockquote>
          <div className="flex items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-semibold">
              JD
            </div>
            <div className="text-left">
              <div className="font-semibold text-gray-900">John Davis</div>
              <div className="text-sm text-gray-500">CFO, TechStartup Inc.</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA / Demo Section */}
      <section id="demo" className="py-24 px-6 bg-gray-900" ref={ctaRef.ref}>
        <div
          className={`max-w-4xl mx-auto text-center transition-all duration-700 ${
            ctaRef.isInView
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-8"
          }`}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Maximize Your R&D Credits?
          </h2>
          <p className="text-lg text-gray-400 mb-10 max-w-2xl mx-auto">
            Book a personalized demo and see how TaxScape can help you capture 
            every dollar of R&D tax credits you deserve.
          </p>

          <div className="bg-white rounded-2xl p-8 max-w-lg mx-auto">
            <div className="flex items-center justify-center gap-2 text-blue-600 mb-6">
              {Icons.calendar}
              <span className="font-medium">Schedule Your Demo</span>
            </div>

            {/* Calendly Embed */}
            <div className="calendly-embed">
              <iframe
                src="https://calendly.com/sam-taxscape/30min?hide_gdpr_banner=1&background_color=ffffff&text_color=1f2937&primary_color=2563eb"
                width="100%"
                height="630"
                frameBorder="0"
                title="Schedule a demo"
                className="rounded-lg"
              />
            </div>

            <p className="text-xs text-gray-500 mt-4 text-center">
              Or email us directly at{" "}
              <a href="mailto:sam@taxscape.com" className="text-blue-600 hover:underline">
                sam@taxscape.com
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 bg-gray-950">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
                T
              </div>
              <span className="font-semibold text-white">TaxScape</span>
            </div>

            <div className="flex items-center gap-6 text-sm text-gray-400">
              <Link href="/portal" className="hover:text-white transition-colors">
                Portal
              </Link>
              <a href="#" className="hover:text-white transition-colors">
                Privacy Policy
              </a>
              <a href="#" className="hover:text-white transition-colors">
                Terms of Service
              </a>
              <a href="mailto:contact@taxscape.com" className="hover:text-white transition-colors">
                Contact
              </a>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-gray-800 text-center text-sm text-gray-500">
            © {new Date().getFullYear()} TaxScape Pro. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
