"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

// Icons
const ArrowRight = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
  </svg>
);

const ChevronDown = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

const CheckCircle = () => (
  <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const XCircle = () => (
  <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
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

// Counter animation hook
function useCounter(end: number, duration: number = 2000, startOnView: boolean = true) {
  const [count, setCount] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    if (!startOnView || hasStarted) return;
    
    setHasStarted(true);
    let startTime: number;
    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);
      setCount(Math.floor(progress * end));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [end, duration, startOnView, hasStarted]);

  return count;
}

const features = [
  {
    title: "AI Classification Agent",
    description: "Reviews employees, projects, and expenses — flagging QRE candidates for your approval with detailed reasoning.",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
      </svg>
    ),
  },
  {
    title: "Interview Agent",
    description: "Validates documentation through structured interviews with R&D teams, summarizing findings for your review.",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
      </svg>
    ),
  },
  {
    title: "Document Processing",
    description: "Extracts and organizes data from payroll, GL, and invoices — presenting clean summaries for verification.",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  {
    title: "Workflow Orchestration",
    description: "Coordinates all agents and tracks progress, escalating decisions to you at every critical checkpoint.",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
];

const steps = [
  {
    number: "1",
    title: "Upload Documents",
    description: "Simply upload your payroll, GL exports, project lists, and employee data. We handle all formats.",
  },
  {
    number: "2", 
    title: "AI Analyzes & Classifies",
    description: "Our agents review every data point, classify expenses, and identify qualified activities.",
  },
  {
    number: "3",
    title: "Review & Export",
    description: "Review AI recommendations, make adjustments, and export audit-ready documentation.",
  },
];

const stats = [
  { value: 80, suffix: "%", label: "Time Saved" },
  { value: 30, suffix: "%+", label: "Credit Enhancement" },
  { value: 100, suffix: "%", label: "Audit-Ready" },
  { value: 12, suffix: "+", label: "Industries" },
];

const faqs = [
  {
    question: "What is the R&D tax credit?",
    answer: "The R&D tax credit (IRC Section 41) is a dollar-for-dollar reduction in tax liability for companies that engage in qualified research activities. It can offset income tax or, for eligible startups, payroll taxes up to $500,000 annually."
  },
  {
    question: "Who qualifies for R&D credits?",
    answer: "Any company that develops or improves products, processes, software, techniques, or formulas may qualify. This includes traditional R&D as well as activities in software development, manufacturing improvements, and engineering design."
  },
  {
    question: "How does AI help with R&D tax credits?",
    answer: "Our AI agents automate the time-consuming aspects of credit preparation: data extraction, expense classification, employee time allocation, and documentation generation. This reduces preparation time by 80% while improving accuracy."
  },
  {
    question: "Is my data secure?",
    answer: "Yes. We maintain SOC 2 Type II compliance, encrypt all data at rest and in transit, and never use customer data to train our models. Your client information remains completely confidential."
  },
  {
    question: "What about IRS audits?",
    answer: "Our platform generates contemporaneous documentation that meets IRS requirements. Every AI recommendation includes detailed reasoning and source citations, creating a clear audit trail that supports defensible credit claims."
  },
];

const comparisonItems = [
  { manual: "Weeks of data gathering", ai: "Hours with AI extraction" },
  { manual: "Manual spreadsheet analysis", ai: "Automated classification" },
  { manual: "Inconsistent documentation", ai: "Standardized audit trail" },
  { manual: "Error-prone calculations", ai: "Verified computations" },
  { manual: "Limited scalability", ai: "Handle unlimited studies" },
];

export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  
  const heroRef = useInView();
  const demoRef = useInView();
  const featuresRef = useInView();
  const stepsRef = useInView();
  const statsRef = useInView();
  const comparisonRef = useInView();
  const faqRef = useInView();
  const ctaRef = useInView();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? "bg-white/90 backdrop-blur-md border-b border-gray-100"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl tracking-tight" >
              TaxScape
            </span>
          </Link>

          <div className="flex items-center gap-8">
            <a
              href="/about"
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              About
            </a>
            <Link
              href="/login"
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="hidden sm:inline-flex items-center gap-2 px-5 py-2 bg-gray-900 text-white rounded text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              Get Started
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section 
        ref={heroRef.ref}
        className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden"
        style={{ background: 'linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)' }}
      >
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <div className={`transition-all duration-1000 ${heroRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <p className="text-sm uppercase tracking-[0.2em] text-gray-400 mb-6">
              R&D Tax Credit Intelligence
            </p>
            
            <h1 
              className="text-5xl md:text-6xl lg:text-7xl font-normal text-gray-900 mb-8 leading-[1.1] tracking-tight"
              
            >
              Precision tools for
              <br />
              <span className="bg-gradient-to-r from-gray-900 via-gray-600 to-gray-900 bg-clip-text text-transparent">
                world-class tax teams
              </span>
            </h1>
            
            <p className="text-lg md:text-xl text-gray-500 mb-12 max-w-2xl mx-auto leading-relaxed font-light">
              AI agents that handle the complexity of R&D tax credits — 
              organizing data, classifying expenses, and building audit-ready documentation.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link 
                href="/register"
                className="group inline-flex items-center gap-3 px-8 py-4 bg-gray-900 text-white rounded-lg text-base font-medium hover:bg-gray-800 transition-all shadow-lg shadow-gray-900/20"
              >
                Get Started
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <a 
                href="https://calendly.com/sam-taxscape/30min"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-8 py-4 text-gray-600 hover:text-gray-900 text-base font-medium transition-colors"
              >
                Book a Demo
              </a>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent" />
      </section>

      {/* Product Demo Section */}
      <section ref={demoRef.ref} className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className={`transition-all duration-700 ${demoRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <div className="text-center mb-12">
              <p className="text-sm uppercase tracking-[0.2em] text-gray-400 mb-4">
                See It In Action
              </p>
              <h2 
                className="text-4xl md:text-5xl font-normal text-gray-900 tracking-tight"
                
              >
                Your AI-powered R&D studio
              </h2>
            </div>

            {/* Mock Dashboard */}
            <div className="relative rounded-2xl overflow-hidden border border-gray-200 shadow-2xl shadow-gray-200/50 bg-gray-50">
              {/* Browser Chrome */}
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-100 border-b border-gray-200">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                  <div className="w-3 h-3 rounded-full bg-green-400"></div>
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="px-4 py-1 bg-white rounded text-xs text-gray-500">app.taxscape.com</div>
                </div>
              </div>

              {/* Dashboard Content */}
              <div className="p-6 md:p-8 bg-gradient-to-br from-gray-50 to-white min-h-[400px]">
                <div className="grid md:grid-cols-3 gap-6">
                  {/* Stats Cards */}
                  <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                    <div className="text-sm text-gray-500 mb-2">Total QRE Identified</div>
                    <div className="text-3xl font-semibold text-gray-900">$2.4M</div>
                    <div className="mt-2 text-xs text-emerald-600">+15% from initial estimate</div>
                  </div>
                  <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                    <div className="text-sm text-gray-500 mb-2">Documents Processed</div>
                    <div className="text-3xl font-semibold text-gray-900">1,247</div>
                    <div className="mt-2 text-xs text-gray-400">Payroll, GL, Invoices</div>
                  </div>
                  <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                    <div className="text-sm text-gray-500 mb-2">Employees Classified</div>
                    <div className="text-3xl font-semibold text-gray-900">89</div>
                    <div className="mt-2 text-xs text-gray-400">42 qualified for R&D</div>
                  </div>
                </div>

                {/* Activity Feed Mock */}
                <div className="mt-6 bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                  <div className="text-sm font-medium text-gray-900 mb-4">AI Agent Activity</div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-sm">
                      <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                      <span className="text-gray-600">Classification Agent completed employee review</span>
                      <span className="text-gray-400 ml-auto">2m ago</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                      <span className="text-gray-600">Document Agent extracted Q4 payroll data</span>
                      <span className="text-gray-400 ml-auto">5m ago</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                      <span className="text-gray-600">Interview Agent scheduled with Engineering Lead</span>
                      <span className="text-gray-400 ml-auto">12m ago</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Four Ways Section */}
      <section ref={featuresRef.ref} className="py-24 bg-[#0a0a0a] text-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 
              className="text-4xl md:text-5xl font-normal tracking-tight mb-4"
              
            >
              Four ways we transform your practice
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Our AI agents work together to handle every aspect of R&D credit preparation
            </p>
          </div>

          <div 
            className={`grid md:grid-cols-2 gap-6 transition-all duration-700 ${
              featuresRef.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            {features.map((feature, index) => (
              <div 
                key={feature.title} 
                className="group relative p-8 rounded-2xl bg-gradient-to-br from-gray-900 to-gray-900/50 border border-gray-800 hover:border-gray-700 transition-all duration-300"
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                {/* Glow effect on hover */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                
                <div className="relative">
                  <div className="w-14 h-14 rounded-xl bg-white/10 flex items-center justify-center mb-6 text-white">
                    {feature.icon}
                  </div>
                  <h3 
                    className="text-xl font-medium mb-3"
                    
                  >
                    {feature.title}
                  </h3>
                  <p className="text-gray-400 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3 Steps Section */}
      <section ref={stepsRef.ref} className="py-24 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm uppercase tracking-[0.2em] text-gray-400 mb-4">
              Simple Process
            </p>
            <h2 
              className="text-4xl md:text-5xl font-normal text-gray-900 tracking-tight"
              
            >
              R&D credits in 3 steps
            </h2>
          </div>

          <div 
            className={`grid md:grid-cols-3 gap-8 transition-all duration-700 ${
              stepsRef.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            {steps.map((step, index) => (
              <div 
                key={step.number} 
                className="relative text-center"
                style={{ transitionDelay: `${index * 150}ms` }}
              >
                {/* Connector line */}
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-12 left-[60%] w-[80%] h-px bg-gray-200" />
                )}
                
                <div className="relative inline-flex items-center justify-center w-24 h-24 rounded-full bg-gray-100 mb-6">
                  <span 
                    className="text-4xl font-light text-gray-900"
                    
                  >
                    {step.number}
                  </span>
                </div>
                <h3 
                  className="text-xl font-medium text-gray-900 mb-3"
                  
                >
                  {step.title}
                </h3>
                <p className="text-gray-500 leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section ref={statsRef.ref} className="py-24 bg-[#0a0a0a] text-white">
        <div className="max-w-5xl mx-auto px-6">
          <div 
            className={`grid grid-cols-2 md:grid-cols-4 gap-8 transition-all duration-700 ${
              statsRef.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            {stats.map((stat, index) => {
              const count = statsRef.isInView ? stat.value : 0;
              return (
                <div key={stat.label} className="text-center" style={{ transitionDelay: `${index * 100}ms` }}>
                  <div 
                    className="text-5xl md:text-6xl font-light mb-2"
                    
                  >
                    <CountUp end={stat.value} isInView={statsRef.isInView} />{stat.suffix}
                  </div>
                  <div className="text-sm uppercase tracking-wider text-gray-400">
                    {stat.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Comparison Section */}
      <section ref={comparisonRef.ref} className="py-24 bg-gray-50">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm uppercase tracking-[0.2em] text-gray-400 mb-4">
              The Difference
            </p>
            <h2 
              className="text-4xl md:text-5xl font-normal text-gray-900 tracking-tight"
              
            >
              Manual vs AI-Assisted
            </h2>
          </div>

          <div 
            className={`transition-all duration-700 ${
              comparisonRef.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            <div className="grid md:grid-cols-2 gap-8">
              {/* Manual Column */}
              <div className="bg-white rounded-2xl p-8 border border-gray-200">
                <div className="text-center mb-8">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-50 text-red-600 text-sm font-medium mb-4">
                    Traditional Process
                  </div>
                  <h3 
                    className="text-2xl font-normal text-gray-900"
                    
                  >
                    Manual Methods
                  </h3>
                </div>
                <div className="space-y-4">
                  {comparisonItems.map((item, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <XCircle />
                      <span className="text-gray-600">{item.manual}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Column */}
              <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 text-white">
                <div className="text-center mb-8">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/20 text-emerald-400 text-sm font-medium mb-4">
                    TaxScape AI
                  </div>
                  <h3 
                    className="text-2xl font-normal"
                    
                  >
                    AI-Assisted
                  </h3>
                </div>
                <div className="space-y-4">
                  {comparisonItems.map((item, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <CheckCircle />
                      <span className="text-gray-300">{item.ai}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section ref={faqRef.ref} className="py-24 bg-white">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm uppercase tracking-[0.2em] text-gray-400 mb-4">
              FAQ
            </p>
            <h2 
              className="text-4xl md:text-5xl font-normal text-gray-900 tracking-tight"
              
            >
              Frequently asked questions
            </h2>
          </div>

          <div 
            className={`space-y-4 transition-all duration-700 ${
              faqRef.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            {faqs.map((faq, index) => (
              <div 
                key={index} 
                className="border border-gray-200 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="font-medium text-gray-900">{faq.question}</span>
                  <ChevronDown 
                    className={`w-5 h-5 text-gray-400 transition-transform ${
                      openFaq === index ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {openFaq === index && (
                  <div className="px-6 pb-6">
                    <p className="text-gray-600 leading-relaxed">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section ref={ctaRef.ref} className="py-24 bg-[#0a0a0a] text-white">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className={`transition-all duration-700 ${ctaRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <h2 
              className="text-4xl md:text-5xl font-normal mb-6 tracking-tight"
              
            >
              Ready to transform your practice?
            </h2>
            <p className="text-lg text-gray-400 mb-10 leading-relaxed">
              Join forward-thinking firms using intelligent tools to deliver better results.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
              <Link 
                href="/register"
                className="group inline-flex items-center gap-3 px-8 py-4 bg-white text-gray-900 rounded-lg text-base font-medium hover:bg-gray-100 transition-all"
              >
                Get Started
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <a 
                href="https://calendly.com/sam-taxscape/30min"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-8 py-4 text-gray-400 hover:text-white text-base font-medium transition-colors"
              >
                Book a Demo
              </a>
            </div>

            {/* Compliance badges */}
            <div className="pt-8 border-t border-gray-800">
              <p className="text-xs text-gray-500 mb-4 uppercase tracking-wider">Enterprise Security</p>
              <div className="flex items-center justify-center gap-8 text-gray-500">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center text-xs font-medium">SOC</div>
                  <span className="text-sm">SOC 2</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center text-xs font-medium">256</div>
                  <span className="text-sm">Encrypted</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center text-xs font-medium">GDPR</div>
                  <span className="text-sm">Compliant</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 px-6 bg-white border-t border-gray-100">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-4 gap-12">
            <div className="md:col-span-2">
              <span 
                className="text-xl tracking-tight text-gray-900"
                
              >
                TaxScape
              </span>
              <p className="text-sm text-gray-400 mt-4 max-w-xs">
                Precision tools for world-class tax teams. 
                Augmenting expertise with intelligent automation.
              </p>
              <div className="mt-6 text-sm text-gray-400">
                <div>San Francisco, CA</div>
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wider text-gray-400 mb-4">Product</div>
              <div className="space-y-3">
                <Link href="/login" className="block text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  Portal
                </Link>
                <Link href="/register" className="block text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  Get Started
                </Link>
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wider text-gray-400 mb-4">Company</div>
              <div className="space-y-3">
                <a href="/about" className="block text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  About
                </a>
                <a href="mailto:hello@taxscape.com" className="block text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  Contact
                </a>
                <a href="#" className="block text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  Privacy
                </a>
                <a href="#" className="block text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  Terms
                </a>
              </div>
            </div>
          </div>

          <div className="mt-16 pt-8 border-t border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-sm text-gray-400">
              © {new Date().getFullYear()} TaxScape. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
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
