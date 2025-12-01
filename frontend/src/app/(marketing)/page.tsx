"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

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

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const featuresRef = useInView();
  const processRef = useInView();
  const ctaRef = useInView();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">
      {/* Gradient Background Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[120px]" />
        <div className="absolute top-[40%] right-[-15%] w-[500px] h-[500px] bg-purple-600/15 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[30%] w-[400px] h-[400px] bg-emerald-600/10 rounded-full blur-[100px]" />
      </div>

      {/* Navigation */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled 
            ? "bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/5" 
            : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg shadow-blue-500/25 group-hover:shadow-blue-500/40 transition-all">
              T
            </div>
            <span className="text-xl font-semibold tracking-tight">TaxScape</span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="px-5 py-2.5 text-sm text-gray-300 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="#demo"
              className="px-5 py-2.5 bg-white text-gray-900 text-sm font-medium rounded-full hover:bg-gray-100 transition-all shadow-lg shadow-white/10"
            >
              Book Demo
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-4xl">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm mb-8 backdrop-blur-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-gray-300">AI-Powered R&D Tax Credit Analysis</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold leading-[0.95] tracking-tight mb-8">
              <span className="text-white">Maximize your</span>
              <br />
              <span className="bg-gradient-to-r from-blue-400 via-blue-500 to-purple-500 bg-clip-text text-transparent">
                R&D tax credits
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-xl md:text-2xl text-gray-400 leading-relaxed max-w-2xl mb-12">
              Our AI auditor validates projects against IRS Section 41 requirements 
              and generates compliant documentation in minutes.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-start gap-4">
              <Link
                href="#demo"
                className="group px-8 py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium rounded-full hover:from-blue-400 hover:to-blue-500 transition-all shadow-xl shadow-blue-500/25 flex items-center gap-3"
              >
                Book a Demo
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="group-hover:translate-x-1 transition-transform">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
              <Link
                href="/login"
                className="px-8 py-4 bg-white/5 text-white font-medium rounded-full hover:bg-white/10 transition-all border border-white/10"
              >
                Sign In to Portal
              </Link>
            </div>
          </div>

          {/* Hero Stats */}
          <div className="mt-24 grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { value: "$2.4M+", label: "Credits Identified" },
              { value: "500+", label: "Projects Analyzed" },
              { value: "98%", label: "Audit Success Rate" },
              { value: "6.5%", label: "Average Credit Rate" },
            ].map((stat, i) => (
              <div 
                key={i} 
                className="p-6 rounded-2xl bg-white/[0.03] border border-white/5 backdrop-blur-sm"
              >
                <div className="text-3xl md:text-4xl font-bold text-white mb-1">
                  {stat.value}
                </div>
                <div className="text-sm text-gray-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-32 px-6 relative" ref={featuresRef.ref}>
        <div className="max-w-7xl mx-auto">
          <div className="max-w-2xl mb-20">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Everything you need to claim your credits
            </h2>
            <p className="text-xl text-gray-400">
              From qualification to documentation, we handle the entire process.
            </p>
          </div>

          <div
            className={`grid md:grid-cols-3 gap-8 transition-all duration-1000 ${
              featuresRef.isInView
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-12"
            }`}
          >
            {[
              {
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect width="18" height="10" x="3" y="11" rx="2" />
                    <circle cx="12" cy="5" r="2" />
                    <path d="M12 7v4" />
                    <circle cx="8" cy="16" r="1" fill="currentColor" />
                    <circle cx="16" cy="16" r="1" fill="currentColor" />
                  </svg>
                ),
                title: "AI Tax Auditor",
                description: "Interactive interviews validate your projects against the IRS Four-Part Test. Every qualified activity captured.",
                gradient: "from-blue-500/20 to-blue-600/0",
              },
              {
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                ),
                title: "IRS Compliant",
                description: "Audit-ready documentation meeting Section 41 and 174 requirements. Defensible calculations, every time.",
                gradient: "from-emerald-500/20 to-emerald-600/0",
              },
              {
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline points="14 2 14 8 20 8" />
                    <path d="M8 13h2M8 17h2M14 13h2M14 17h2" />
                  </svg>
                ),
                title: "Excel Reports",
                description: "Comprehensive studies with QRE calculations, Section 280C analysis, and 174 amortization schedules.",
                gradient: "from-purple-500/20 to-purple-600/0",
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="group relative p-8 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all duration-500"
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <div className={`absolute inset-0 rounded-3xl bg-gradient-to-b ${feature.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                <div className="relative">
                  <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-6 text-white">
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                  <p className="text-gray-400 leading-relaxed">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="py-32 px-6" ref={processRef.ref}>
        <div className="max-w-7xl mx-auto">
          <div
            className={`grid lg:grid-cols-2 gap-20 items-center transition-all duration-1000 ${
              processRef.isInView
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-12"
            }`}
          >
            <div>
              <h2 className="text-4xl md:text-5xl font-bold mb-8">
                Stop leaving money on the table
              </h2>
              <p className="text-xl text-gray-400 mb-12">
                Most companies miss 20-40% of eligible credits due to incomplete 
                documentation or misunderstanding the Four-Part Test.
              </p>

              <div className="space-y-6">
                {[
                  "Identify all qualified research activities",
                  "Calculate wages, supplies, and contractor QREs",
                  "Generate contemporaneous documentation",
                  "Prepare for IRS audits with confidence",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-400">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <span className="text-gray-300">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Credit Rate Card */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-3xl blur-xl" />
              <div className="relative p-10 rounded-3xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/10 backdrop-blur-sm">
                <div className="text-7xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent mb-2">
                  6.5%
                </div>
                <div className="text-gray-400 text-lg mb-10">Average Credit Rate</div>
                
                <div className="space-y-6">
                  {[
                    { label: "Qualified Wages", value: "100% of QRE" },
                    { label: "Contract Research", value: "65% of QRE" },
                    { label: "Supplies", value: "100% of QRE" },
                  ].map((item, i) => (
                    <div key={i} className="flex justify-between items-center pb-4 border-b border-white/5 last:border-0 last:pb-0">
                      <span className="text-gray-400">{item.label}</span>
                      <span className="font-semibold">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-20 px-6 border-y border-white/5">
        <div className="max-w-7xl mx-auto">
          <p className="text-center text-sm text-gray-500 uppercase tracking-widest mb-12">
            Trusted by innovative companies
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-16 gap-y-8">
            {["TechCorp", "InnovateLab", "DevStudio", "CloudBase", "DataFlow"].map((company) => (
              <div key={company} className="text-2xl font-semibold text-gray-600 hover:text-gray-400 transition-colors">
                {company}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="py-32 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" className="text-white/10 mx-auto mb-8">
            <path d="M11.192 15.757c0-.88-.23-1.618-.69-2.217-.326-.412-.768-.683-1.327-.812-.55-.128-1.07-.137-1.54-.028-.16-.95.1-1.956.76-3.022.66-1.065 1.515-1.867 2.558-2.403L9.373 5c-.8.396-1.56.898-2.26 1.505-.71.607-1.34 1.305-1.9 2.094s-.98 1.68-1.25 2.69-.346 2.04-.217 3.1c.168 1.4.62 2.52 1.356 3.35.735.84 1.652 1.26 2.748 1.26.965 0 1.766-.29 2.4-.878.628-.576.94-1.365.94-2.368l.002.003zm9.124 0c0-.88-.23-1.618-.69-2.217-.326-.42-.77-.692-1.327-.817-.56-.124-1.074-.13-1.54-.022-.16-.94.09-1.95.75-3.02.66-1.06 1.514-1.86 2.557-2.4L18.49 5c-.8.396-1.555.898-2.26 1.505-.708.607-1.34 1.305-1.894 2.094-.556.79-.97 1.68-1.24 2.69-.273 1-.345 2.04-.217 3.1.165 1.4.615 2.52 1.35 3.35.732.833 1.646 1.25 2.742 1.25.967 0 1.768-.29 2.402-.876.627-.576.942-1.365.942-2.368v.01z"/>
          </svg>
          <blockquote className="text-3xl md:text-4xl font-medium leading-relaxed mb-10">
            &ldquo;TaxScape identified{" "}
            <span className="text-blue-400">$180,000</span> in R&D credits 
            we would have missed. The AI auditor made the qualification 
            process painless.&rdquo;
          </blockquote>
          <div className="flex items-center justify-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
              JD
            </div>
            <div className="text-left">
              <div className="font-semibold">John Davis</div>
              <div className="text-sm text-gray-500">CFO, TechStartup Inc.</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA / Demo Section */}
      <section id="demo" className="py-32 px-6 relative" ref={ctaRef.ref}>
        <div className="absolute inset-0 bg-gradient-to-t from-blue-600/5 to-transparent" />
        <div
          className={`max-w-4xl mx-auto text-center relative transition-all duration-1000 ${
            ctaRef.isInView
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-12"
          }`}
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Ready to maximize your R&D credits?
          </h2>
          <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto">
            Book a personalized demo and see how TaxScape can help you capture 
            every dollar you deserve.
          </p>

          {/* Calendly Embed Container */}
          <div className="relative rounded-3xl bg-white overflow-hidden shadow-2xl shadow-black/50">
            <iframe
              src="https://calendly.com/sam-taxscape/30min?hide_gdpr_banner=1&background_color=ffffff&text_color=0a0a0f&primary_color=3b82f6"
              width="100%"
              height="700"
              frameBorder="0"
              title="Schedule a demo"
            />
          </div>

          <p className="mt-8 text-gray-500">
            Or email us at{" "}
            <a href="mailto:sam@taxscape.com" className="text-blue-400 hover:text-blue-300 transition-colors">
              sam@taxscape.com
            </a>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 px-6 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg shadow-blue-500/25">
                T
              </div>
              <span className="text-xl font-semibold">TaxScape</span>
            </Link>

            <div className="flex items-center gap-8 text-sm text-gray-400">
              <Link href="/login" className="hover:text-white transition-colors">
                Sign In
              </Link>
              <a href="#" className="hover:text-white transition-colors">
                Privacy
              </a>
              <a href="#" className="hover:text-white transition-colors">
                Terms
              </a>
              <a href="mailto:sam@taxscape.com" className="hover:text-white transition-colors">
                Contact
              </a>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-white/5 text-center text-sm text-gray-600">
            © {new Date().getFullYear()} TaxScape Pro. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
