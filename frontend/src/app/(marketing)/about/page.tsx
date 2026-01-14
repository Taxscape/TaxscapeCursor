"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

// Icons
const ArrowRight = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
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

export default function AboutPage() {
  const [scrolled, setScrolled] = useState(false);
  
  const heroRef = useInView();
  const teamRef = useInView();
  const joinRef = useInView();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const team = [
    {
      name: "Ali Hussain",
      role: "CEO & Co-Founder",
      placeholder: "AH"
    },
    {
      name: "Rebecca Schwartz",
      role: "Co-Founder",
      placeholder: "RS"
    },
    {
      name: "Deepak Bapat",
      role: "CTO & Co-Founder",
      placeholder: "DB"
    }
  ];

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900">
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
            <span className="text-2xl font-bold tracking-tight">
              TaxScape<span className="text-blue-600">.ai</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-10">
            <Link href="/#how-it-works" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">How it Works</Link>
            <Link href="/case-studies" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Case Studies</Link>
            <Link href="/about" className="text-sm font-bold text-gray-900">About</Link>
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
        className="pt-48 pb-20 text-center"
      >
        <div className="max-w-4xl mx-auto px-6">
          <div className={`transition-all duration-1000 ${heroRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <h1 className="text-5xl md:text-6xl font-black text-gray-900 mb-8 leading-tight tracking-tight">
              Founded to fix the R&D <br />
              credit stack, for good
            </h1>
            
            <p className="text-xl md:text-2xl text-gray-500 max-w-3xl mx-auto leading-relaxed">
              TaxScape was founded by a team of operators who have spent decades building and scaling companies.
            </p>
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section ref={teamRef.ref} className="pb-32 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className={`grid md:grid-cols-3 gap-8 transition-all duration-1000 ${teamRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
            {team.map((member, i) => (
              <div key={i} className="space-y-6">
                <div className="aspect-[4/5] bg-gray-100 rounded-[32px] overflow-hidden flex items-center justify-center relative group">
                  <div className="absolute inset-0 bg-gradient-to-tr from-blue-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <span className="text-8xl font-black text-gray-200 group-hover:text-blue-600/20 transition-colors duration-500">
                    {member.placeholder}
                  </span>
                </div>
                <div className="px-2">
                  <h3 className="text-xl font-bold text-gray-900">{member.name}</h3>
                  <p className="text-gray-500 font-medium">{member.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Join Section */}
      <section ref={joinRef.ref} className="py-32 bg-gray-50 border-t border-gray-100">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className={`transition-all duration-1000 ${joinRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <h2 className="text-4xl md:text-5xl font-black text-gray-900 mb-8 tracking-tight">
              Ready to join us?
            </h2>
            <Link 
              href="/careers"
              className="inline-flex items-center gap-3 text-2xl font-bold text-blue-600 hover:text-blue-700 transition-colors group"
            >
              See our open roles
              <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 bg-white border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <Link href="/" className="inline-block mb-10">
            <span className="text-2xl font-bold tracking-tight">
              TaxScape<span className="text-blue-600">.ai</span>
            </span>
          </Link>
          
          <div className="flex justify-center gap-10 text-sm font-bold text-gray-500 mb-10">
            <Link href="/case-studies" className="hover:text-blue-600 transition-colors">Case Studies</Link>
            <Link href="/about" className="hover:text-blue-600 transition-colors">About</Link>
            <Link href="/careers" className="hover:text-blue-600 transition-colors">Careers</Link>
            <Link href="/privacy" className="hover:text-blue-600 transition-colors">Privacy Policy</Link>
            <a href="mailto:hello@taxscape.ai" className="hover:text-blue-600 transition-colors">Contact</a>
          </div>

          <p className="text-sm text-gray-400 font-medium italic">
            © {new Date().getFullYear()} TaxScape.ai. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
