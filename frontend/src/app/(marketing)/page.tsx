"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

// Icons as simple SVG components
const ArrowRight = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
  </svg>
);

const Quote = () => (
  <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
    <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10H14.017zM0 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10H0z" />
  </svg>
);

const Sparkles = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

const MessageSquare = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

const FileText = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const Zap = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

const Building2 = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
  </svg>
);

const Users = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const CheckCircle2 = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const TrendingUp = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
);

const Clock = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const Shield = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

const Lightbulb = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
  </svg>
);

const Eye = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

// Intersection Observer hook
function useInView() {
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsInView(true);
      },
      { threshold: 0.1 }
    );

    const currentRef = ref.current;
    if (currentRef) observer.observe(currentRef);
    return () => {
      if (currentRef) observer.unobserve(currentRef);
      observer.disconnect();
    };
  }, []);

  return { ref, isInView };
}

const features = [
  {
    icon: Sparkles,
    title: "AI Classification Agent",
    description: "Reviews employees, projects, and expenses — flagging QRE candidates for your approval.",
    gradient: "from-blue-500/20 to-purple-500/20"
  },
  {
    icon: MessageSquare,
    title: "Interview Agent",
    description: "Validates contemporaneous documentation through structured interviews with R&D teams, summarizing findings for your review.",
    gradient: "from-emerald-500/20 to-teal-500/20"
  },
  {
    icon: FileText,
    title: "Document Processing Agent",
    description: "Extracts and organizes data from payroll, GL, and invoices — presenting clean summaries for your verification.",
    gradient: "from-orange-500/20 to-amber-500/20"
  },
  {
    icon: Zap,
    title: "Workflow Orchestration",
    description: "Coordinates all agents and tracks progress, escalating decisions to you at every critical checkpoint.",
    gradient: "from-pink-500/20 to-rose-500/20"
  },
];

const stats = [
  { value: "80%", label: "Less Time on Data Gathering", Icon: Clock },
  { value: "30%+", label: "Credits Enhanced", Icon: TrendingUp },
  { value: "100%", label: "Contemporaneous Documentation", Icon: Shield },
];

const testimonials = [
  {
    quote: "TaxScape.ai has transformed how we handle R&D tax credits. What used to take weeks now takes days.",
    author: "Tax Partner",
    company: "Regional CPA Firm"
  },
  {
    quote: "The AI classification is incredibly accurate. It catches nuances in job descriptions that we might miss.",
    author: "R&D Tax Director",
    company: "Enterprise Corporation"
  }
];

const compliancePaths = [
  "R&D Footprint",
  "Payroll Offset",
  "Sec 174 Mapping",
  "Research Project Portfolio Overview",
  "IRS Four-Part Test – Summary",
  "Experimental Scientific Workflow",
  "ASC 730 → IRC §41 Reconciliation",
  "Federal Credit Summary",
  "State Credit Summary",
  "Section G - Business Component"
];

export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);
  const featuresRef = useInView();
  const statsRef = useInView();
  const productsRef = useInView();
  const eligibilityRef = useInView();
  const testimonialsRef = useInView();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="overflow-hidden">
      {/* Navigation */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-slate-900/80 backdrop-blur-xl border-b border-white/10"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-white">TaxScape</span>
            <span className="text-xs uppercase tracking-wider text-white/50 hidden sm:inline">R&D Credit Studio</span>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm text-white/70 hover:text-white transition-colors"
            >
              Portal Login
            </Link>
            <Link
              href="/login"
              className="hidden sm:flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg text-sm font-medium text-white transition-all border border-white/10"
            >
              Book a Demo
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section 
        className="relative min-h-[90vh] flex items-center"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}
      >
        {/* Geometric pattern overlay */}
        <div className="absolute inset-0 hero-pattern opacity-30" />
        
        {/* Gradient orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        
        <div className="container mx-auto px-6 lg:px-8 relative z-10">
          <div className="max-w-5xl mx-auto text-center">
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-white mb-6 leading-[0.95] tracking-tight animate-slide-up">
              R&D Tax Credits.
              <br />
              <span className="text-white/80">Made Simple.</span>
            </h1>
            
            <p className="text-lg md:text-xl text-white/60 mb-10 max-w-xl mx-auto leading-relaxed animate-slide-up stagger-1">
              Our trained AI agent handles the heavy lifting — organizing data, classifying expenses, and building audit-ready documentation.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 animate-slide-up stagger-2">
              <Link 
                href="/login"
                className="group flex items-center gap-2 px-8 py-4 bg-white text-slate-900 rounded-xl text-lg font-semibold hover:bg-white/90 transition-all shadow-lg shadow-white/10"
              >
                Book a Demo
                <span className="group-hover:translate-x-1 transition-transform">
                  <ArrowRight />
                </span>
              </Link>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-8 text-white/40 animate-fade-in stagger-3">
              <div className="flex items-center gap-2">
                <Building2 />
                <span className="text-sm font-medium">For CPA Firms</span>
              </div>
              <div className="flex items-center gap-2">
                <Users />
                <span className="text-sm font-medium">For In-house Teams</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom gradient fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
      </section>

      {/* Stats Section */}
      <section className="py-24 md:py-32 bg-background" ref={statsRef.ref}>
        <div className="container mx-auto px-6 lg:px-8">
          <div 
            className={`grid grid-cols-1 md:grid-cols-3 gap-12 max-w-5xl mx-auto transition-all duration-700 ${
              statsRef.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            {stats.map((stat, index) => (
              <div 
                key={stat.label} 
                className="text-center"
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-600 mb-6">
                  <stat.Icon />
                </div>
                <div className="text-5xl md:text-6xl lg:text-7xl font-black text-foreground mb-3 tracking-tight">{stat.value}</div>
                <div className="text-lg md:text-xl text-muted-foreground font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section 
        className="py-24 md:py-32" 
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}
        ref={featuresRef.ref}
      >
        <div className="container mx-auto px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto mb-20">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-6 tracking-tight">
              How the R&D Credit Agent Works
            </h2>
            <p className="text-xl md:text-2xl text-white/60 leading-relaxed">
              An organized, step-by-step workflow that takes the complexity out of R&D tax credits — while keeping you in control.
            </p>
          </div>

          <div 
            className={`grid md:grid-cols-2 gap-8 max-w-5xl mx-auto transition-all duration-700 ${
              featuresRef.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            {features.map((feature, index) => (
              <div 
                key={feature.title} 
                className="glass-dark rounded-3xl overflow-hidden hover:bg-white/15 transition-all duration-300 group"
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                {/* Feature image placeholder with gradient */}
                <div className={`aspect-video bg-gradient-to-br ${feature.gradient} flex items-center justify-center`}>
                  <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                    <feature.icon />
                  </div>
                </div>
                <div className="p-8">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-white">
                      <feature.icon />
                    </div>
                    <h3 className="text-xl md:text-2xl font-bold text-white">{feature.title}</h3>
                  </div>
                  <p className="text-white/60 text-lg leading-relaxed">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Product Offerings Section */}
      <section className="py-24 md:py-32 bg-background" ref={productsRef.ref}>
        <div className="container mx-auto px-6 lg:px-8">
          <div className="text-center mb-20">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 text-emerald-600 mb-8">
              <Sparkles />
              <span className="text-base font-semibold">Build Your Solution</span>
            </div>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-foreground mb-6 tracking-tight">
              Tailored to Your R&D Practice
            </h2>
            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto">
              Choose your workflow and enhance with add-on capabilities
            </p>
          </div>

          <div 
            className={`max-w-5xl mx-auto transition-all duration-700 ${
              productsRef.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            {/* Top Row: Columns 1 & 2 side by side */}
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              {/* Column 1: Core Workflow */}
              <div className="glass-card rounded-2xl p-6 shadow-glass">
                <h3 className="text-lg font-bold text-foreground mb-4">1. Choose Your Compliance Path</h3>
                <div className="flex flex-wrap gap-2">
                  {compliancePaths.map((item) => (
                    <label key={item} className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-muted/50 border border-border hover:border-primary/30 cursor-pointer transition-colors">
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-primary/40 bg-primary/10 flex items-center justify-center shrink-0">
                        <CheckCircle2 />
                      </div>
                      <span className="text-xs font-medium text-foreground whitespace-nowrap">{item}</span>
                    </label>
                  ))}
                </div>
                <div className="pt-2 text-center">
                  <span className="text-xs text-muted-foreground">+ More</span>
                </div>
              </div>

              {/* Column 2: Expert Mode Add-on */}
              <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 rounded-2xl border-2 border-emerald-500/30 p-6 shadow-glass relative overflow-hidden">
                <div className="absolute top-0 right-0 px-3 py-1 bg-emerald-500 text-white text-xs font-bold rounded-bl-lg">
                  ADD-ON
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-600">
                    <Eye />
                  </div>
                  <h3 className="text-lg font-bold text-foreground">2. Upgrade to Expert Mode</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Work side-by-side with an AI advisor that surfaces risks, recommends validations, and identifies key personnel.
                </p>
                <div className="space-y-2">
                  {[
                    "Real-time risk alerts",
                    "Evidence recommendations",
                    "Key personnel identification",
                    "Audit defense guidance",
                    "Continuous advisory support"
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-2 text-sm">
                      <span className="text-emerald-500"><CheckCircle2 /></span>
                      <span className="text-foreground">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom Row: CTA */}
            <div className="bg-gradient-to-r from-primary to-primary/80 rounded-2xl p-6 shadow-glass text-white">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="text-center md:text-left">
                  <h3 className="text-lg font-bold mb-2">3. Get Started</h3>
                  <p className="text-white/80 text-sm">
                    Chat with our team and get a customized proposal for your practice.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link
                    href="/login"
                    className="px-6 py-3 bg-white text-primary rounded-lg font-semibold whitespace-nowrap hover:bg-white/90 transition-colors"
                  >
                    Book a Demo
                  </Link>
                </div>
                <div className="hidden lg:flex items-center gap-6 text-sm text-white/80">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 />
                    <span>60-min training</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 />
                    <span>No credit card</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Company Eligibility Section */}
      <section className="py-24 md:py-32 bg-muted/50" ref={eligibilityRef.ref}>
        <div className="container mx-auto px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto mb-20">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-foreground mb-6 tracking-tight">
              Companies Eligible for Credits
            </h2>
            <p className="text-xl md:text-2xl text-muted-foreground">
              From early-stage startups to enterprise organizations — if you&apos;re innovating, you likely qualify.
            </p>
          </div>

          <div 
            className={`grid md:grid-cols-3 gap-8 max-w-5xl mx-auto transition-all duration-700 ${
              eligibilityRef.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            {/* Startup */}
            <div className="glass-card rounded-2xl p-8 hover:shadow-lg transition-all group text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 mx-auto group-hover:scale-110 transition-transform text-primary">
                <Lightbulb />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-3">Startup</h3>
              <p className="text-muted-foreground mb-6">
                Early-stage companies building new products or technologies. Use credits to offset payroll taxes.
              </p>
              <ul className="space-y-3 text-sm text-muted-foreground text-left">
                <li className="flex items-center gap-2"><span className="text-emerald-500"><CheckCircle2 /></span>Payroll tax offset up to $500K/year</li>
                <li className="flex items-center gap-2"><span className="text-emerald-500"><CheckCircle2 /></span>Software development qualifies</li>
                <li className="flex items-center gap-2"><span className="text-emerald-500"><CheckCircle2 /></span>Pre-revenue companies eligible</li>
              </ul>
            </div>

            {/* Mid-Market */}
            <div className="glass-card rounded-2xl p-8 hover:shadow-lg transition-all group text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-6 mx-auto group-hover:scale-110 transition-transform text-emerald-600">
                <TrendingUp />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-3">Mid-Market</h3>
              <p className="text-muted-foreground mb-6">
                Growth-stage companies scaling operations. Maximize credits across multiple departments.
              </p>
              <ul className="space-y-3 text-sm text-muted-foreground text-left">
                <li className="flex items-center gap-2"><span className="text-emerald-500"><CheckCircle2 /></span>Multi-department R&D capture</li>
                <li className="flex items-center gap-2"><span className="text-emerald-500"><CheckCircle2 /></span>Contractor expense inclusion</li>
                <li className="flex items-center gap-2"><span className="text-emerald-500"><CheckCircle2 /></span>State credit optimization</li>
              </ul>
            </div>

            {/* Large Enterprise */}
            <div className="glass-card rounded-2xl p-8 hover:shadow-lg transition-all group text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 mx-auto group-hover:scale-110 transition-transform text-primary">
                <Building2 />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-3">Large Enterprise</h3>
              <p className="text-muted-foreground mb-6">
                Established organizations with complex R&D operations. Enterprise-grade documentation and compliance.
              </p>
              <ul className="space-y-3 text-sm text-muted-foreground text-left">
                <li className="flex items-center gap-2"><span className="text-emerald-500"><CheckCircle2 /></span>Multi-entity consolidation</li>
                <li className="flex items-center gap-2"><span className="text-emerald-500"><CheckCircle2 /></span>ASC 730 alignment</li>
                <li className="flex items-center gap-2"><span className="text-emerald-500"><CheckCircle2 /></span>Audit-ready documentation</li>
              </ul>
            </div>
          </div>

          {/* Disclaimer */}
          <p className="text-center text-sm text-muted-foreground mt-12 max-w-2xl mx-auto">
            *Eligibility depends on qualified research activities under IRC Section 41. Consult with a tax professional to determine your specific eligibility.
          </p>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 md:py-32 bg-muted" ref={testimonialsRef.ref}>
        <div className="container mx-auto px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto mb-16">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-foreground mb-6 tracking-tight">
              What CPAs Are Saying
            </h2>
          </div>

          <div 
            className={`grid md:grid-cols-2 gap-8 max-w-4xl mx-auto transition-all duration-700 ${
              testimonialsRef.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            {testimonials.map((testimonial, index) => (
              <div 
                key={index} 
                className="glass-card rounded-2xl p-8"
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                <div className="text-emerald-500/30 mb-6">
                  <Quote />
                </div>
                <blockquote className="text-lg md:text-xl text-foreground mb-6 leading-relaxed">
                  &ldquo;{testimonial.quote}&rdquo;
                </blockquote>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-emerald-500 flex items-center justify-center text-white text-sm font-bold">
                    {testimonial.author.charAt(0)}
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">{testimonial.author}</div>
                    <div className="text-sm text-muted-foreground">{testimonial.company}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section 
        className="py-24 md:py-32" 
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}
      >
        <div className="container mx-auto px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-6 tracking-tight">
              Ready to Simplify R&D Tax Credits?
            </h2>
            <p className="text-xl md:text-2xl text-white/60 mb-10">
              Join forward-thinking CPA firms using AI to deliver better results in less time.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link 
                href="/login"
                className="group flex items-center gap-2 px-8 py-4 bg-white text-slate-900 rounded-xl text-lg font-semibold hover:bg-white/90 transition-all shadow-lg shadow-white/10"
              >
                Book a Demo
                <span className="group-hover:translate-x-1 transition-transform">
                  <ArrowRight />
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 lg:px-8 border-t border-border bg-background">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-foreground">TaxScape</span>
            <span className="text-xs uppercase tracking-wider text-muted-foreground">R&D Credit Studio</span>
          </div>

          <div className="flex items-center gap-8 text-sm text-muted-foreground">
            <Link href="/login" className="hover:text-foreground transition-colors">Portal</Link>
            <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
            <a href="mailto:sam@taxscape.com" className="hover:text-foreground transition-colors">Contact</a>
          </div>

          <div className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} TaxScape
          </div>
        </div>
      </footer>
    </div>
  );
}
