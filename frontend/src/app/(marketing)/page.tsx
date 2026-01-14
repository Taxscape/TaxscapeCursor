"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

// Icons
const ArrowRight = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
  </svg>
);

const CheckIcon = ({ className = "w-3 h-3" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="4" viewBox="0 0 24 24">
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

export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);
  
  const heroRef = useInView();
  const demoRef = useInView();
  const statsRef = useInView();
  const howItWorksRef = useInView();
  const eligibilityRef = useInView();
  const testimonialsRef = useInView();
  const ctaRef = useInView();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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
            <a href="#how-it-works" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">How it Works</a>
            <a href="#solution" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Solutions</a>
            <Link href="/case-studies" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Case Studies</Link>
            <a href="#eligibility" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Eligibility</a>
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
        className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden bg-gradient-to-b from-blue-50/50 to-white"
      >
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className={`max-w-4xl transition-all duration-1000 ${heroRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <h1 className="text-6xl md:text-8xl font-extrabold text-gray-900 mb-8 leading-[1.05] tracking-tight">
              R&D Tax Credits.<br />
              <span className="text-blue-600">Made Simple.</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-gray-600 mb-12 max-w-2xl leading-relaxed">
              Our trained AI agent handles the heavy lifting — organizing data, classifying expenses, and building world class documentation.
            </p>
            
            <div className="flex flex-wrap gap-4 mb-20">
              <Link 
                href="https://calendly.com/sam-taxscape/30min"
                target="_blank"
                className="inline-flex items-center justify-center px-8 py-4 bg-gray-900 text-white rounded-xl text-lg font-bold hover:bg-gray-800 transition-all shadow-xl shadow-gray-900/10"
              >
                Book a Demo
              </Link>
              <Link 
                href="/register"
                className="inline-flex items-center justify-center px-8 py-4 bg-white text-gray-900 border-2 border-gray-200 rounded-xl text-lg font-bold hover:border-gray-900 transition-all"
              >
                For CPA Firms
              </Link>
              <Link 
                href="/register"
                className="inline-flex items-center justify-center px-8 py-4 bg-white text-gray-900 border-2 border-gray-200 rounded-xl text-lg font-bold hover:border-gray-900 transition-all"
              >
                For In-house Teams
              </Link>
            </div>

            {/* Stats Bar */}
            <div 
              ref={statsRef.ref}
              className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12"
            >
              <div className="space-y-2">
                <div className="text-5xl font-black text-gray-900 tracking-tight">
                  <CountUp end={80} isInView={statsRef.isInView} />%
                </div>
                <div className="text-lg text-gray-500 font-medium">Less Time on Data Gathering</div>
              </div>
              <div className="space-y-2">
                <div className="text-5xl font-black text-gray-900 tracking-tight">
                  <CountUp end={30} isInView={statsRef.isInView} />%+
                </div>
                <div className="text-lg text-gray-500 font-medium">Credits Enhanced</div>
              </div>
              <div className="space-y-2">
                <div className="text-5xl font-black text-gray-900 tracking-tight">
                  <CountUp end={100} isInView={statsRef.isInView} />%
                </div>
                <div className="text-lg text-gray-500 font-medium">Contemporaneous Documentation</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Product Demo Section */}
      <section ref={demoRef.ref} className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className={`transition-all duration-1000 ${demoRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight">
                Your AI-powered R&D studio
              </h2>
            </div>

            {/* Mock Dashboard */}
            <div className="relative rounded-3xl overflow-hidden border border-gray-200 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] bg-white">
              {/* Browser Chrome */}
              <div className="flex items-center gap-2 px-6 py-4 bg-gray-50 border-b border-gray-100">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f57]"></div>
                  <div className="w-3 h-3 rounded-full bg-[#febc2e]"></div>
                  <div className="w-3 h-3 rounded-full bg-[#28c840]"></div>
                </div>
              </div>

              {/* Dashboard Content */}
              <div className="p-8 md:p-12 bg-white">
                <div className="grid md:grid-cols-3 gap-8">
                  {/* Stats Cards */}
                  <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100">
                    <div className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Total QRE Identified</div>
                    <div className="text-4xl font-black text-gray-900 mb-2">$2.4M</div>
                    <div className="text-sm font-bold text-emerald-600">+15% from initial estimate</div>
                  </div>
                  <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100">
                    <div className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Documents Processed</div>
                    <div className="text-4xl font-black text-gray-900 mb-2">1,247</div>
                    <div className="text-sm font-medium text-gray-500">Payroll, GL, Invoices</div>
                  </div>
                  <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100">
                    <div className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Employees Classified</div>
                    <div className="text-4xl font-black text-gray-900 mb-2">89</div>
                    <div className="text-sm font-medium text-gray-500">42 qualified for R&D</div>
                  </div>
                </div>

                {/* Activity Feed Mock */}
                <div className="mt-10 bg-gray-50 rounded-2xl p-8 border border-gray-100">
                  <div className="text-lg font-black text-gray-900 mb-6">AI Agent Activity</div>
                  <div className="space-y-5">
                    <div className="flex items-center gap-4 text-base">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                      <span className="font-bold text-gray-700">Classification Agent completed employee review</span>
                      <span className="text-gray-400 ml-auto font-medium">2m ago</span>
                    </div>
                    <div className="flex items-center gap-4 text-base">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
                      <span className="font-bold text-gray-700">Document Agent extracted Q4 payroll data</span>
                      <span className="text-gray-400 ml-auto font-medium">5m ago</span>
                    </div>
                    <div className="flex items-center gap-4 text-base">
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
                      <span className="font-bold text-gray-700">Interview Agent scheduled with Engineering Lead</span>
                      <span className="text-gray-400 ml-auto font-medium">12m ago</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section id="how-it-works" ref={howItWorksRef.ref} className="py-32 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-3xl mb-20">
            <h2 className="text-4xl md:text-5xl font-black text-gray-900 mb-6 tracking-tight">
              How the R&D Credit Agent Works
            </h2>
            <p className="text-xl text-gray-600 leading-relaxed">
              An organized, step-by-step workflow that takes the complexity out of R&D tax credits — while keeping you in control.
            </p>
          </div>

          <div className={`grid md:grid-cols-2 lg:grid-cols-4 gap-8 transition-all duration-1000 ${howItWorksRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            {[
              {
                title: "AI Classification Agent",
                description: "Reviews employees, projects, and expenses — identifying and classifying QREs for your final review."
              },
              {
                title: "Interview Agent",
                description: "Conducts structured interviews with R&D teams to validate contemporaneous documentation, then summarizes findings for your review."
              },
              {
                title: "Document Processing Agent",
                description: "Extracts and organizes data from payroll, GL, and invoices — presenting clean summaries for your verification."
              },
              {
                title: "Workflow Orchestration",
                description: "Coordinates all agents and tracks progress, escalating decisions to you at every critical checkpoint."
              }
            ].map((agent, i) => (
              <div key={i} className="group p-8 bg-gray-50 rounded-3xl border border-gray-100 hover:border-blue-200 hover:bg-white hover:shadow-2xl transition-all duration-300">
                <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white mb-6 group-hover:scale-110 transition-transform">
                  <span className="text-xl font-bold">{i + 1}</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">{agent.title}</h3>
                <p className="text-gray-600 leading-relaxed">{agent.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Build Your Solution Section */}
      <section id="solution" className="py-32 bg-gray-900 text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/3 w-[800px] h-[800px] bg-blue-600/10 rounded-full blur-[120px]" />
        
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-6xl font-black mb-6 tracking-tight text-white">
              Tailored to Your R&D Practice
            </h2>
            <p className="text-xl text-gray-400 font-medium">Choose your workflow and enhance with add-on capabilities</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 max-w-6xl mx-auto items-stretch">
            {/* 1. Path */}
            <div className="flex flex-col p-10 bg-white/5 rounded-[40px] border border-white/10 backdrop-blur-md hover:bg-white/[0.07] transition-all duration-500">
              <div className="mb-12">
                <div className="inline-flex items-center justify-center px-4 py-1.5 bg-white/10 rounded-full text-[10px] font-black uppercase tracking-widest text-blue-400 mb-6">
                  Step 01
                </div>
                <h3 className="text-3xl font-bold mb-4 text-white">Select Compliance Path</h3>
                <p className="text-gray-400 font-medium">Define the core outputs of your R&D study.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                {[
                  "R&D Footprint", "Payroll Offset", "Sec 174 Mapping",
                  "Project Portfolio", "IRS Four-Part Test",
                  "Scientific Workflow", "ASC 730 → IRC §41",
                  "Federal Credits", "State Credits", "Section G Report"
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 group">
                    <div className="w-4 h-4 rounded-full bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                      <CheckIcon className="text-blue-500 scale-[0.7]" />
                    </div>
                    <span className="text-sm font-bold text-gray-300">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. Expert Mode */}
            <div className="flex flex-col p-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-[40px] border border-blue-400/30 shadow-2xl shadow-blue-900/40 relative overflow-hidden group transform lg:-translate-y-4">
              <div className="absolute top-0 right-0 p-10">
                <div className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-white border border-white/20">
                  Add-On
                </div>
              </div>

              <div className="mb-12 relative z-10">
                <div className="inline-flex items-center justify-center px-4 py-1.5 bg-white/20 rounded-full text-[10px] font-black uppercase tracking-widest text-white mb-6">
                  Step 02
                </div>
                <h3 className="text-4xl font-black mb-4 text-white">Expert Mode</h3>
                <p className="text-blue-100 font-bold text-lg leading-relaxed">
                  Augment your team with real-time risk analysis and evidence-backed recommendations.
                </p>
              </div>

              <div className="space-y-6 relative z-10 mb-12">
                {[
                  "Real-time risk alerts & scoring", 
                  "Evidence gap recommendations",
                  "AI-driven personnel identification", 
                  "Continuous audit defense readiness",
                  "Expert-level technical narratives"
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-4 group/item">
                    <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center group-hover/item:scale-110 transition-transform shadow-lg shadow-blue-900/20">
                      <CheckIcon className="text-blue-600 scale-[0.8]" />
                    </div>
                    <span className="text-lg font-black text-white">{item}</span>
                  </div>
                ))}
              </div>

              <div className="mt-auto relative z-10">
                <button className="w-full py-5 bg-white text-blue-600 rounded-2xl font-black text-xl hover:bg-blue-50 transition-all shadow-xl shadow-blue-900/20 active:scale-95">
                  Enable Expert Mode
                </button>
              </div>

              {/* Decorative Elements */}
              <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-white/10 rounded-full blur-[80px] group-hover:bg-white/20 transition-colors duration-1000" />
            </div>
          </div>
        </div>
      </section>

      {/* Companies Section */}
      <section id="eligibility" ref={eligibilityRef.ref} className="py-32 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-black text-gray-900 mb-6 tracking-tight">
              Companies Eligible for Credits
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              From early-stage startups to enterprise organizations — if you're innovating, you likely qualify.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                type: "Startup",
                content: "Early-stage companies building new products or technologies. Use credits to offset payroll taxes.",
                bullets: ["Payroll tax offset up to $500K/year", "Software development qualifies", "Pre-revenue companies eligible"]
              },
              {
                type: "Mid-Market",
                content: "Growth-stage companies scaling operations. Maximize credits across multiple departments.",
                bullets: ["Multi-department R&D capture", "Contractor expense inclusion", "State credit optimization"]
              },
              {
                type: "Large Enterprise",
                content: "Established organizations with complex R&D operations. Enterprise-grade documentation and compliance.",
                bullets: ["Multi-entity consolidation", "ASC 730 alignment", "World class documentation"]
              }
            ].map((card, i) => (
              <div key={i} className="bg-white p-10 rounded-3xl border border-gray-100 shadow-xl shadow-gray-200/50">
                <h3 className="text-2xl font-black text-gray-900 mb-4">{card.type}</h3>
                <p className="text-gray-600 mb-8 leading-relaxed">{card.content}</p>
                <ul className="space-y-4">
                  {card.bullets.map((bullet, j) => (
                    <li key={j} className="flex items-start gap-3">
                      <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />
                      <span className="text-sm font-bold text-gray-700">{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-16 text-center">
            <p className="text-sm text-gray-400 italic">
              *Eligibility depends on qualified research activities under IRC Section 41. Consult with a tax professional to determine your specific eligibility.
            </p>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section ref={testimonialsRef.ref} className="py-32 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight">
              Trusted by Leading Firms
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-12">
            {[
              "TaxScape.ai has transformed how we handle R&D tax credits. What used to take weeks now takes days.",
              "The AI classification is incredibly accurate. It catches nuances in job descriptions that we might miss."
            ].map((quote, i) => (
              <div key={i} className="bg-blue-50/50 p-12 rounded-[40px] relative">
                <div className="text-6xl text-blue-200 absolute top-8 left-8 font-serif leading-none">“</div>
                <p className="text-2xl font-medium text-gray-800 relative z-10 leading-relaxed italic">
                  {quote}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section ref={ctaRef.ref} className="py-32 bg-blue-600 text-white relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
          <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-white rounded-full blur-[100px] -translate-x-1/2 -translate-y-1/2" />
        </div>
        
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <h2 className="text-4xl md:text-7xl font-black mb-8 tracking-tight">
            Ready to Add a Trained AI Agent to Your Team?
          </h2>
          <p className="text-xl md:text-2xl text-blue-100 mb-12">
            Book a demo and see how TaxScape.ai can transform your R&D tax credit practice.
          </p>
          <Link 
            href="https://calendly.com/sam-taxscape/30min"
            target="_blank"
            className="inline-flex items-center justify-center px-12 py-5 bg-white text-blue-600 rounded-2xl text-2xl font-black hover:bg-gray-100 transition-all shadow-2xl shadow-blue-900/20 transform hover:scale-105 active:scale-95"
          >
            Book a Demo
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
              <a href="#" className="hover:text-blue-600 transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-blue-600 transition-colors">Terms of Service</a>
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
