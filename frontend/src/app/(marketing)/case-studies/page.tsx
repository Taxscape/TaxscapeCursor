"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

// Icons
const ArrowRight = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
  </svg>
);

const CheckIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

// Intersection Observer hook
function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsInView(true);
      },
      { threshold }
    );

    const currentRef = ref.current;
    if (currentRef) observer.observe(currentRef);
    return () => {
      if (currentRef) observer.unobserve(currentRef);
      observer.disconnect();
    };
  }, [threshold]);

  return { ref, isInView };
}

// CountUp component for animated numbers
function CountUp({ end, isInView }: { end: number; isInView: boolean }) {
  const [count, setCount] = useState(0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!isInView || hasAnimated.current) return;
    hasAnimated.current = true;

    let startTime: number;
    const duration = 2000;

    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(easeOut * end));
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }, [end, isInView]);

  return <>{count}</>;
}

export default function CaseStudiesPage() {
  const [scrolled, setScrolled] = useState(false);
  
  const heroRef = useInView();
  const statsRef = useInView();
  const caseStudiesRef = useInView();
  const ctaRef = useInView();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const caseStudies = [
    {
      industry: "Technology",
      tags: ["Series B SaaS Startup", "Software Development", "First-Time Claimant"],
      title: "30% Credit Enhancement for Growing Tech Company",
      challenge: "A fast-growing SaaS company with 85 engineers had never claimed R&D credits despite significant software development activities. Their internal team lacked the expertise to identify qualifying projects and document the 4-part test.",
      solution: "TaxScape's AI Interview Agent conducted structured interviews with engineering leads, identifying 12 qualifying projects across their platform development. The trained agent surfaced technical uncertainties that the team hadn't recognized as R&D activities.",
      results: [
        { label: "Credits Identified", value: "$420K", sub: "First-year R&D credit claim" },
        { label: "Time Saved", value: "85%", sub: "Compared to manual documentation" },
        { label: "Projects Qualified", value: "12", sub: "Across 3 product lines" }
      ],
      quote: "We had no idea our infrastructure work qualified. The AI agent asked the right questions and built a compelling narrative.",
      author: "VP of Engineering"
    },
    {
      industry: "Manufacturing",
      tags: ["Mid-Market Manufacturer", "IRS Audit", "Documentation"],
      title: "World Class Documentation in 2 Weeks",
      challenge: "A precision manufacturing company faced an IRS examination on their R&D credit claims. Their existing documentation was scattered across emails, spreadsheets, and engineering notes with no centralized audit trail.",
      solution: "TaxScape's Expert Mode analyzed their existing claims, identified documentation gaps, and recommended specific employees who could validate technical uncertainties. The Auditor View generated a comprehensive audit binder with evidence citations.",
      results: [
        { label: "Audit Outcome", value: "100%", sub: "Credits sustained" },
        { label: "Prep Time", value: "2 weeks", sub: "vs. 3 months estimated" },
        { label: "Documentation", value: "450 pages", sub: "Auto-generated audit binder" }
      ],
      quote: "The auditor was impressed with our documentation quality. TaxScape identified exactly who could answer each question.",
      author: "Tax Director"
    },
    {
      industry: "Professional Services",
      tags: ["Regional CPA Firm", "Scalability", "Efficiency"],
      title: "5x Client Capacity with Same Team",
      challenge: "A 15-person CPA firm wanted to expand their R&D tax credit practice but couldn't hire specialized staff. Each engagement took 40+ hours of manual classification and narrative writing.",
      solution: "TaxScape's trained agents handled data intake, employee classification, and initial narrative drafts. CPAs focused on review, client communication, and strategic advisory — the high-value work.",
      results: [
        { label: "Engagements", value: "5x", sub: "Increased client capacity" },
        { label: "Hours/Project", value: "8 hrs", sub: "Down from 40+ hours" },
        { label: "Revenue Growth", value: "280%", sub: "R&D practice revenue" }
      ],
      quote: "We were really able to scale our R&D offering across existing clients. It was very easy once we saw great results.",
      author: "Partner, Tax Practice"
    },
    {
      industry: "Life Sciences",
      tags: ["Clinical-Stage Biotech", "Multi-State", "Contractor 65%"],
      title: "Complex Multi-State Credit Optimization",
      challenge: "A biotech company with R&D activities across 4 states needed to maximize credits while navigating different state rules. Their contractor spend was significant but poorly documented for the 65% rule.",
      solution: "TaxScape's Classification Agent analyzed contractor invoices and SOWs, automatically applying the 65% rule and flagging US-location requirements. The multi-state engine optimized credit allocation across California, Massachusetts, New Jersey, and Texas.",
      results: [
        { label: "Total Credits", value: "$1.2M", sub: "Federal + state combined" },
        { label: "Contractor QRE", value: "$340K", sub: "Previously unclaimed" },
        { label: "States Optimized", value: "4", sub: "Automatic allocation" }
      ],
      quote: "The contractor analysis alone paid for a decade of TaxScape. We were leaving money on the table.",
      author: "CFO"
    }
  ];

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Navigation */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? "bg-white/90 backdrop-blur-md border-b border-gray-100"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl font-bold tracking-tight text-gray-900">
              TaxScape<span className="text-blue-600">.ai</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-10">
            <Link href="/#how-it-works" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">How it Works</Link>
            <Link href="/case-studies" className="text-sm font-medium text-gray-900 transition-colors">Case Studies</Link>
            <Link href="/#eligibility" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Eligibility</Link>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors px-4 py-2"
            >
              Sign In
            </Link>
            <Link
              href="https://calendly.com/sam-taxscape/30min"
              target="_blank"
              className="inline-flex items-center justify-center px-6 py-2.5 bg-blue-600 text-white rounded-full text-sm font-semibold hover:bg-blue-700 transition-all shadow-md hover:shadow-lg"
            >
              Book a Demo
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section 
        ref={heroRef.ref}
        className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden bg-gradient-to-b from-blue-50/50 to-white text-center"
      >
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className={`transition-all duration-1000 ${heroRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <h1 className="text-5xl md:text-7xl font-extrabold text-gray-900 mb-8 leading-tight tracking-tight">
              Customer <span className="text-blue-600">Success Stories</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-gray-600 mb-12 max-w-3xl mx-auto leading-relaxed">
              See how CPA firms and companies are maximizing R&D tax credits with TaxScape.ai
            </p>

            {/* Stats Bar */}
            <div 
              ref={statsRef.ref}
              className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 max-w-5xl mx-auto mt-20"
            >
              {[
                { end: 100, suffix: "%", label: "Project Success Rate" },
                { end: 30, suffix: "%+", label: "Avg Credit Enhancement" },
                { end: 80, suffix: "%", label: "Time Saved" },
                { end: 0, suffix: "", label: "Audit Failures" }
              ].map((stat, i) => (
                <div key={i} className="space-y-2">
                  <div className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight">
                    <CountUp end={stat.end} isInView={statsRef.isInView} />{stat.suffix}
                  </div>
                  <div className="text-sm text-gray-500 font-bold uppercase tracking-wider">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Case Studies List */}
      <section ref={caseStudiesRef.ref} className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="space-y-32">
            {caseStudies.map((study, i) => (
              <div 
                key={i} 
                className={`grid lg:grid-cols-2 gap-16 items-start transition-all duration-1000 ${caseStudiesRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <div className="space-y-8">
                  <div className="space-y-4">
                    <div className="inline-flex items-center px-4 py-1.5 bg-blue-50 text-blue-600 rounded-full text-xs font-black uppercase tracking-widest border border-blue-100">
                      {study.industry}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {study.tags.map((tag, j) => (
                        <span key={j} className="text-xs font-bold text-gray-400 border border-gray-100 px-2 py-1 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <h2 className="text-3xl md:text-4xl font-black text-gray-900 leading-tight">
                      {study.title}
                    </h2>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 mb-2">The Challenge</h3>
                      <p className="text-gray-600 leading-relaxed">{study.challenge}</p>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 mb-2">The Solution</h3>
                      <p className="text-gray-600 leading-relaxed">{study.solution}</p>
                    </div>
                  </div>

                  <div className="bg-blue-600 p-8 rounded-3xl text-white relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 text-white/10 group-hover:scale-110 transition-transform">
                      <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M14.017 21L14.017 18C14.017 16.8954 14.9124 16 16.017 16H19.017C19.5693 16 20.017 15.5523 20.017 15V9C20.017 8.44772 19.5693 8 19.017 8H16.017C14.9124 8 14.017 7.10457 14.017 6V5C14.017 3.89543 14.9124 3 16.017 3H19.017C21.2261 3 23.017 4.79086 23.017 7V15C23.017 18.3137 20.3307 21 17.017 21H14.017ZM1 21L1 18C1 16.8954 1.89543 16 3 16H6C6.55228 16 7 15.5523 7 15V9C7 8.44772 6.55228 8 6 8H3C1.89543 8 1 7.10457 1 6V5C1 3.89543 1.89543 3 3 3H6C8.20914 3 10 4.79086 10 7V15C10 18.3137 7.31371 21 4 21H1Z" />
                      </svg>
                    </div>
                    <p className="text-xl font-medium mb-6 relative z-10 italic">
                      "{study.quote}"
                    </p>
                    <div className="font-bold relative z-10 opacity-80">— {study.author}</div>
                  </div>
                </div>

                <div className="bg-gray-50 p-10 rounded-4xl border border-gray-100 space-y-10 lg:mt-12">
                  <h3 className="text-2xl font-black text-gray-900">Results</h3>
                  <div className="space-y-8">
                    {study.results.map((result, k) => (
                      <div key={k} className="flex items-start gap-6 border-b border-gray-200 pb-8 last:border-0 last:pb-0">
                        <div className="text-4xl md:text-5xl font-black text-blue-600 tabular-nums">
                          {result.value}
                        </div>
                        <div className="space-y-1">
                          <div className="text-lg font-bold text-gray-900">{result.label}</div>
                          <div className="text-sm text-gray-500">{result.sub}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section ref={ctaRef.ref} className="py-32 bg-blue-600 text-white relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <h2 className="text-4xl md:text-7xl font-black mb-8 tracking-tight">
            Ready to Write Your Success Story?
          </h2>
          <p className="text-xl md:text-2xl text-blue-100 mb-12">
            Join firms and companies who are transforming their R&D tax credit process with TaxScape.ai
          </p>
          <Link 
            href="https://calendly.com/sam-taxscape/30min"
            target="_blank"
            className="inline-flex items-center justify-center px-12 py-5 bg-white text-blue-600 rounded-2xl text-2xl font-black hover:bg-gray-100 transition-all shadow-2xl shadow-blue-900/20 transform hover:scale-105 active:scale-95"
          >
            Schedule a Demo
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 bg-gray-50 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-10">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-2xl font-bold tracking-tight text-gray-900">
                TaxScape<span className="text-blue-600">.ai</span>
              </span>
            </Link>
            
            <div className="flex gap-10 text-sm font-bold text-gray-500">
              <Link href="/case-studies" className="hover:text-blue-600 transition-colors">Case Studies</Link>
              <Link href="/privacy" className="hover:text-blue-600 transition-colors">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-blue-600 transition-colors">Terms of Service</Link>
              <a href="mailto:hello@taxscape.ai" className="hover:text-blue-600 transition-colors">Contact</a>
            </div>

            <p className="text-sm text-gray-400 font-medium">
              © {new Date().getFullYear()} TaxScape.ai. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
