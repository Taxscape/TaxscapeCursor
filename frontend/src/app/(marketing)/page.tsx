"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

// Intersection Observer for scroll animations
function useInView() {
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setIsInView(true);
    }, { threshold: 0.1 });

    const currentRef = ref.current;
    if (currentRef) observer.observe(currentRef);
    return () => {
      if (currentRef) observer.unobserve(currentRef);
      observer.disconnect();
    };
  }, []);

  return { ref, isInView };
}

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const featuresRef = useInView();
  const workspaceRef = useInView();
  const ctaRef = useInView();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#F6F6F7] text-[#17181A] font-sans antialiased">
      {/* Subtle grid background */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(to right, #17181A 1px, transparent 1px), linear-gradient(to bottom, #17181A 1px, transparent 1px)`,
          backgroundSize: '48px 48px'
        }}
      />

      {/* Navigation */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled 
            ? "bg-[#E0E1E4]/70 backdrop-blur-xl border-b border-black/[0.06]" 
            : "bg-transparent"
        }`}
      >
        <div className="max-w-[1280px] mx-auto px-20 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[15px] font-medium tracking-tight text-[#17181A]">TaxScape</span>
            <span className="text-[11px] uppercase tracking-[0.08em] text-[#6B6D72]">R&D Credit Studio</span>
          </div>

          <div className="flex items-center gap-6">
            <Link
              href="/login"
              className="text-[13px] text-[#6B6D72] hover:text-[#17181A] transition-colors"
            >
              Portal Login
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-32 px-20">
        <div className="max-w-[1280px] mx-auto">
          <div className="grid grid-cols-12 gap-6 items-center">
            {/* Left: Text */}
            <div className="col-span-6">
              <h1 className="text-[40px] font-medium leading-[1.1] tracking-[-0.02em] text-[#17181A] mb-6">
                R&D credit studies,
                <br />
                engineered.
              </h1>
              
              <p className="text-[16px] text-[#6B6D72] leading-relaxed mb-10 max-w-md">
                AI-guided audit interviews and compliant study generation 
                for Section 41 R&D tax credits.
              </p>

              <div className="flex items-center gap-3">
                <Link
                  href="/login"
                  className="px-6 py-2.5 bg-[#323338] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#3A3B40] transition-colors"
                >
                  Start new study
                </Link>
                <button className="px-6 py-2.5 border border-[#D4D5D8] text-[#17181A] text-[13px] font-medium rounded-[6px] hover:bg-white/50 transition-colors">
                  Load existing file
                </button>
              </div>
            </div>

            {/* Right: Abstract glass dashboard cluster */}
            <div className="col-span-6 relative h-[400px]">
              {/* Background glass panel */}
              <div className="absolute top-8 right-0 w-[320px] h-[280px] rounded-xl bg-white/40 backdrop-blur-sm border border-white/20 shadow-[0_18px_60px_rgba(0,0,0,0.06)]" />
              
              {/* Foreground glass panel with grid */}
              <div className="absolute top-0 right-16 w-[300px] h-[260px] rounded-xl bg-white/60 backdrop-blur-md border border-white/30 shadow-[0_18px_60px_rgba(0,0,0,0.08)] p-6">
                {/* Mini chart grid lines */}
                <div className="h-full flex flex-col justify-between">
                  <div className="flex justify-between text-[11px] uppercase tracking-[0.08em] text-[#6B6D72]">
                    <span>QRE Summary</span>
                    <span>FY 2024</span>
                  </div>
                  <div className="flex-1 flex items-end gap-3 mt-4">
                    {[65, 45, 78, 52, 88, 42, 70].map((h, i) => (
                      <div 
                        key={i} 
                        className="flex-1 bg-[#E2E3E6] rounded-sm"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-black/[0.05] flex justify-between">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.08em] text-[#6B6D72]">Total QRE</div>
                      <div className="text-[20px] font-medium text-[#17181A]">$1.94M</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.08em] text-[#6B6D72]">Credit</div>
                      <div className="text-[20px] font-medium text-[#17181A]">$126K</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Small floating card */}
              <div className="absolute bottom-16 right-8 w-[180px] rounded-lg bg-white/70 backdrop-blur-sm border border-white/30 shadow-[0_8px_32px_rgba(0,0,0,0.06)] p-4">
                <div className="text-[11px] uppercase tracking-[0.08em] text-[#6B6D72] mb-1">Projects</div>
                <div className="text-[24px] font-medium text-[#17181A]">12</div>
                <div className="text-[12px] text-[#6B6D72]">qualified activities</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats row */}
      <section className="py-16 px-20 border-y border-black/[0.05]">
        <div className="max-w-[1280px] mx-auto">
          <div className="grid grid-cols-4 gap-6">
            {[
              { value: "$2.4M+", label: "CREDITS IDENTIFIED" },
              { value: "500+", label: "STUDIES GENERATED" },
              { value: "98%", label: "AUDIT SUCCESS" },
              { value: "6.5%", label: "AVG CREDIT RATE" },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-[32px] font-medium text-[#17181A] mb-1">{stat.value}</div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-[#6B6D72]">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 px-20" ref={featuresRef.ref}>
        <div className="max-w-[1280px] mx-auto">
          <div className="max-w-lg mb-16">
            <h2 className="text-[28px] font-medium leading-tight text-[#17181A] mb-4">
              Structured credit analysis
            </h2>
            <p className="text-[15px] text-[#6B6D72] leading-relaxed">
              From intake to deliverable, every step is engineered for compliance and precision.
            </p>
          </div>

          <div
            className={`grid grid-cols-3 gap-6 transition-all duration-700 ${
              featuresRef.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            {[
              {
                title: "Auditor Chat",
                desc: "Guided interviews validate projects against the IRS Four-Part Test. Every response normalized and structured.",
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="14" rx="2" />
                    <path d="M8 21h8" />
                    <path d="M12 17v4" />
                  </svg>
                ),
              },
              {
                title: "Study Engine",
                desc: "Automatic QRE calculation, Section 280C analysis, and 174 amortization schedules from structured data.",
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                ),
              },
              {
                title: "Compliance Output",
                desc: "Excel workbooks, JSON exports, and narrative memos ready for IRS audit defense.",
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                  </svg>
                ),
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="p-8 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_0_0_1px_rgba(0,0,0,0.03)]"
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <div className="w-10 h-10 rounded-lg bg-[#EFEFF1] flex items-center justify-center text-[#3A3B40] mb-5">
                  {feature.icon}
                </div>
                <h3 className="text-[17px] font-medium text-[#17181A] mb-2">{feature.title}</h3>
                <p className="text-[14px] text-[#6B6D72] leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Workspace Preview */}
      <section className="py-24 px-20 bg-[#EFEFF1]" ref={workspaceRef.ref}>
        <div className="max-w-[1280px] mx-auto">
          <div
            className={`transition-all duration-700 ${
              workspaceRef.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            {/* Console preview */}
            <div className="rounded-2xl bg-white/60 backdrop-blur-md border border-white/40 shadow-[0_18px_60px_rgba(0,0,0,0.06)] overflow-hidden">
              {/* Header bar */}
              <div className="h-12 bg-[#E2E3E6]/60 border-b border-black/[0.05] flex items-center px-6">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#D4D5D8]" />
                  <div className="w-3 h-3 rounded-full bg-[#D4D5D8]" />
                  <div className="w-3 h-3 rounded-full bg-[#D4D5D8]" />
                </div>
                <div className="flex-1 text-center text-[12px] text-[#6B6D72]">TaxScape Workspace</div>
              </div>

              {/* Main content */}
              <div className="p-8 grid grid-cols-12 gap-6">
                {/* Left: Chat panel */}
                <div className="col-span-7 rounded-xl bg-white/70 backdrop-blur-sm border border-white/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
                  <div className="p-5 border-b border-black/[0.05] flex items-center justify-between">
                    <span className="text-[15px] font-medium text-[#17181A]">Auditor Chat</span>
                    <span className="text-[11px] uppercase tracking-[0.08em] text-[#6B6D72] px-2 py-1 rounded bg-black/[0.03] border border-black/[0.05]">Mode: Intake</span>
                  </div>
                  
                  {/* Progress stepper */}
                  <div className="px-5 py-4 border-b border-black/[0.05]">
                    <div className="flex items-center gap-4">
                      {["Projects", "Wages", "Contractors", "Supplies", "Review"].map((step, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-[#3A3B40]' : 'border border-[#D4D5D8]'}`} />
                          <span className={`text-[11px] ${i === 0 ? 'text-[#17181A] font-medium' : 'text-[#6B6D72]'}`}>{step}</span>
                          {i < 4 && <div className="w-8 h-px bg-[#E2E3E6]" />}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="p-5 space-y-4 min-h-[200px]">
                    <div className="flex gap-3">
                      <div className="w-0.5 bg-[#3A3B40] rounded-full" />
                      <div className="flex-1 p-4 rounded-lg bg-[#F6F6F7] border border-[#E2E3E6]">
                        <p className="text-[14px] text-[#17181A]">Describe your first R&D project. What technical uncertainty were you trying to resolve?</p>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <div className="p-4 rounded-lg bg-white border border-[#E2E3E6] max-w-[80%]">
                        <p className="text-[14px] text-[#17181A]">We developed a new ML algorithm for fraud detection with real-time processing requirements.</p>
                      </div>
                    </div>
                  </div>

                  {/* Input */}
                  <div className="p-4 border-t border-black/[0.05]">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-[#F6F6F7] border border-[#E2E3E6]">
                      <input 
                        type="text" 
                        placeholder="Ask or answer in plain language…" 
                        className="flex-1 bg-transparent text-[14px] text-[#17181A] placeholder:text-[#A8A9AD] outline-none"
                      />
                      <button className="w-8 h-8 rounded-md hover:bg-[#E2E3E6] flex items-center justify-center text-[#6B6D72]">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right: Study overview */}
                <div className="col-span-5 space-y-4">
                  {/* Status card */}
                  <div className="rounded-xl bg-white/70 backdrop-blur-sm border border-white/50 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[15px] font-medium text-[#17181A]">Current Study</span>
                      <select className="text-[12px] text-[#6B6D72] bg-transparent border border-[#E2E3E6] rounded px-2 py-1">
                        <option>FY 2024 Study</option>
                      </select>
                    </div>
                    
                    {/* Completeness nodes */}
                    <div className="flex items-center gap-1 mb-4">
                      {[true, true, true, false, false].map((filled, i) => (
                        <div key={i} className="flex-1 h-1 rounded-full bg-[#E2E3E6]">
                          {filled && <div className="h-full rounded-full bg-[#3A3B40]" />}
                        </div>
                      ))}
                    </div>
                    
                    <div className="space-y-1 text-[12px] text-[#6B6D72]">
                      <div>Intake completeness: 68%</div>
                      <div>Validation flags: 3 items to review</div>
                    </div>
                  </div>

                  {/* Snapshot tiles */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "PROJECTS QUALIFIED", value: "12" },
                      { label: "ESTIMATED QRE", value: "$1.94M" },
                      { label: "US / FOREIGN", value: "88% / 12%" },
                      { label: "280C ELECTION", value: "Standard" },
                    ].map((tile, i) => (
                      <div key={i} className="p-4 rounded-lg bg-white/60 border border-white/50">
                        <div className="text-[11px] uppercase tracking-[0.08em] text-[#6B6D72] mb-1">{tile.label}</div>
                        <div className="text-[18px] font-medium text-[#17181A]">{tile.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Deliverables */}
                  <div className="rounded-xl bg-white/70 backdrop-blur-sm border border-white/50 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
                    <div className="text-[13px] font-medium text-[#17181A] mb-3">Deliverables</div>
                    <div className="space-y-2">
                      {[
                        { label: "Generate Excel study", icon: "xlsx" },
                        { label: "Download JSON summary", icon: "json" },
                        { label: "Preview narrative memo", icon: "doc" },
                      ].map((item, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-lg hover:bg-[#F6F6F7] transition-colors cursor-pointer group">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-[#EFEFF1] flex items-center justify-center">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#6B6D72]">
                                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                                <polyline points="14 2 14 8 20 8" />
                              </svg>
                            </div>
                            <span className="text-[13px] text-[#17181A]">{item.label}</span>
                          </div>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#A8A9AD] group-hover:text-[#6B6D72] transition-colors">
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="py-24 px-20">
        <div className="max-w-[800px] mx-auto text-center">
          <blockquote className="text-[24px] font-medium leading-relaxed text-[#17181A] mb-8">
            &ldquo;TaxScape identified $180,000 in credits we would have missed. 
            The structured approach eliminated guesswork from our audit prep.&rdquo;
          </blockquote>
          <div className="flex items-center justify-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[#E2E3E6] flex items-center justify-center text-[13px] font-medium text-[#6B6D72]">
              JD
            </div>
            <div className="text-left">
              <div className="text-[14px] font-medium text-[#17181A]">John Davis</div>
              <div className="text-[12px] text-[#6B6D72]">CFO, TechStartup Inc.</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section id="demo" className="py-24 px-20 bg-[#E8E9EB]" ref={ctaRef.ref}>
        <div
          className={`max-w-[1280px] mx-auto transition-all duration-700 ${
            ctaRef.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <div className="grid grid-cols-2 gap-8">
            {/* Left: Description */}
            <div className="flex flex-col justify-center">
              <h2 className="text-[28px] font-medium leading-tight text-[#17181A] mb-4">
                Begin your study
              </h2>
              <p className="text-[15px] text-[#6B6D72] leading-relaxed mb-8 max-w-md">
                Schedule a walkthrough or start immediately. 
                The auditor guides you through every phase of the intake process.
              </p>
              <div className="flex gap-3">
                <Link
                  href="/login"
                  className="px-6 py-2.5 bg-[#323338] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#3A3B40] transition-colors"
                >
                  Start new study
                </Link>
                <a 
                  href="mailto:sam@taxscape.com"
                  className="px-6 py-2.5 border border-[#D4D5D8] text-[#17181A] text-[13px] font-medium rounded-[6px] hover:bg-white/50 transition-colors"
                >
                  Contact us
                </a>
              </div>
            </div>

            {/* Right: Calendly */}
            <div className="rounded-xl bg-white/70 backdrop-blur-sm border border-white/50 shadow-[0_18px_60px_rgba(0,0,0,0.06)] overflow-hidden">
              <iframe
                src="https://calendly.com/sam-taxscape/30min?hide_gdpr_banner=1&background_color=ffffff&text_color=17181A&primary_color=323338"
                width="100%"
                height="580"
                frameBorder="0"
                title="Schedule a demo"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-20 border-t border-black/[0.05]">
        <div className="max-w-[1280px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[14px] font-medium text-[#17181A]">TaxScape</span>
            <span className="text-[11px] uppercase tracking-[0.08em] text-[#A8A9AD]">R&D Credit Studio</span>
          </div>

          <div className="flex items-center gap-8 text-[12px] text-[#6B6D72]">
            <Link href="/login" className="hover:text-[#17181A] transition-colors">Portal</Link>
            <a href="#" className="hover:text-[#17181A] transition-colors">Privacy</a>
            <a href="#" className="hover:text-[#17181A] transition-colors">Terms</a>
            <a href="mailto:sam@taxscape.com" className="hover:text-[#17181A] transition-colors">Contact</a>
          </div>

          <div className="text-[11px] text-[#A8A9AD]">
            © {new Date().getFullYear()} TaxScape
          </div>
        </div>
      </footer>
    </div>
  );
}
