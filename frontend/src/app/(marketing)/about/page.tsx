"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

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

const teamMembers = [
  {
    name: "Team Member Name",
    role: "Co-founder & CEO",
    bio: "Background in tax technology and enterprise software. Previously led product at a Fortune 500 company.",
  },
  {
    name: "Team Member Name",
    role: "Co-founder & CTO",
    bio: "Machine learning researcher with expertise in document understanding and natural language processing.",
  },
  {
    name: "Team Member Name",
    role: "Head of Product",
    bio: "Former R&D tax consultant with deep domain expertise in credit calculation and audit defense.",
  },
  {
    name: "Team Member Name",
    role: "Head of Engineering",
    bio: "Full-stack engineer with experience building scalable systems for financial services.",
  },
];

const values = [
  {
    title: "Precision",
    description: "We believe in accuracy over speed. Every calculation, every classification, every document must meet the highest standards.",
  },
  {
    title: "Transparency",
    description: "Our AI shows its reasoning. Every recommendation can be traced back to its source, enabling confident decision-making.",
  },
  {
    title: "Partnership",
    description: "We augment expertise, not replace it. Tax professionals remain in control while we handle the complexity.",
  },
  {
    title: "Security",
    description: "Client data is sacred. We maintain enterprise-grade security and never train on customer information.",
  },
];

export default function AboutPage() {
  const [scrolled, setScrolled] = useState(false);
  const heroRef = useInView();
  const storyRef = useInView();
  const missionRef = useInView();
  const teamRef = useInView();
  const valuesRef = useInView();

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
            <span className="text-xl tracking-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
              TaxScape
            </span>
          </Link>

          <div className="flex items-center gap-8">
            <Link
              href="/about"
              className="text-sm text-gray-900 font-medium"
            >
              About
            </Link>
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
        className="pt-32 pb-24 bg-white"
      >
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className={`transition-all duration-1000 ${heroRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <p className="text-sm uppercase tracking-[0.2em] text-gray-400 mb-6">
              About Us
            </p>
            
            <h1 
              className="text-5xl md:text-6xl font-normal text-gray-900 mb-8 leading-[1.1] tracking-tight"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Building the future of
              <br />
              tax intelligence
            </h1>
            
            <p className="text-lg md:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed font-light">
              We're a team of tax experts, engineers, and researchers committed to 
              augmenting the capabilities of world-class tax professionals.
            </p>
          </div>
        </div>
      </section>

      {/* Our Story Section */}
      <section ref={storyRef.ref} className="py-24 bg-gray-50">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className={`transition-all duration-700 ${storyRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
              <p className="text-sm uppercase tracking-[0.2em] text-gray-400 mb-4">
                Our Story
              </p>
              <h2 
                className="text-4xl font-normal text-gray-900 mb-6 tracking-tight leading-tight"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                From complexity to clarity
              </h2>
              <div className="space-y-4 text-gray-600 leading-relaxed">
                <p>
                  TaxScape was founded with a simple observation: R&D tax credit preparation 
                  was unnecessarily complex. Talented professionals spent countless hours on 
                  data gathering and documentation instead of applying their expertise.
                </p>
                <p>
                  We brought together a team with deep experience in both tax consulting and 
                  artificial intelligence. Our goal was clear — build tools that handle the 
                  complexity while keeping professionals in control.
                </p>
                <p>
                  Today, we work with leading CPA firms and corporate tax departments, 
                  helping them deliver better results with greater efficiency. Our platform 
                  processes thousands of documents, but every decision remains in the hands 
                  of qualified experts.
                </p>
              </div>
            </div>
            
            {/* Placeholder for image or visual */}
            <div className={`transition-all duration-700 delay-200 ${storyRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
              <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center">
                <span className="text-gray-300 text-sm uppercase tracking-wider">Image Placeholder</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section ref={missionRef.ref} className="py-24 bg-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className={`transition-all duration-700 ${missionRef.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <p className="text-sm uppercase tracking-[0.2em] text-gray-400 mb-4">
              Our Mission
            </p>
            <h2 
              className="text-4xl md:text-5xl font-normal text-gray-900 mb-8 tracking-tight"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Augmenting expertise,
              <br />
              not replacing it
            </h2>
            <p className="text-lg text-gray-500 leading-relaxed max-w-2xl mx-auto">
              We believe the future of professional services lies in intelligent collaboration 
              between humans and machines. Our mission is to build tools that amplify the 
              capabilities of tax professionals, allowing them to focus on what they do best — 
              applying judgment, building relationships, and delivering value to their clients.
            </p>
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section ref={teamRef.ref} className="py-24 bg-gray-50">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm uppercase tracking-[0.2em] text-gray-400 mb-4">
              Our Team
            </p>
            <h2 
              className="text-4xl font-normal text-gray-900 tracking-tight"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              The people behind TaxScape
            </h2>
          </div>

          <div 
            className={`grid md:grid-cols-2 lg:grid-cols-4 gap-8 transition-all duration-700 ${
              teamRef.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            {teamMembers.map((member, index) => (
              <div 
                key={member.name + index} 
                className="text-center"
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                {/* Avatar placeholder */}
                <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gray-200 flex items-center justify-center">
                  <span className="text-gray-400 text-xs uppercase">Photo</span>
                </div>
                <h3 
                  className="text-lg font-medium text-gray-900 mb-1"
                  style={{ fontFamily: "'Playfair Display', serif" }}
                >
                  {member.name}
                </h3>
                <div className="text-sm text-gray-500 mb-3">{member.role}</div>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {member.bio}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section ref={valuesRef.ref} className="py-24 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm uppercase tracking-[0.2em] text-gray-400 mb-4">
              Our Values
            </p>
            <h2 
              className="text-4xl font-normal text-gray-900 tracking-tight"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              What guides us
            </h2>
          </div>

          <div 
            className={`grid md:grid-cols-2 gap-8 transition-all duration-700 ${
              valuesRef.isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            {values.map((value, index) => (
              <div 
                key={value.title} 
                className="p-8 border border-gray-100 rounded-lg"
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                <h3 
                  className="text-xl font-medium text-gray-900 mb-3"
                  style={{ fontFamily: "'Playfair Display', serif" }}
                >
                  {value.title}
                </h3>
                <p className="text-gray-500 leading-relaxed">
                  {value.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gray-900">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 
            className="text-4xl font-normal text-white mb-6 tracking-tight"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Join us on the journey
          </h2>
          <p className="text-lg text-gray-400 mb-10 leading-relaxed">
            We're always looking for talented people who share our vision.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link 
              href="/register"
              className="group inline-flex items-center gap-3 px-8 py-4 bg-white text-gray-900 rounded text-base font-medium hover:bg-gray-100 transition-all"
            >
              Get Started
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a 
              href="mailto:careers@taxscape.com"
              className="inline-flex items-center px-8 py-4 text-gray-400 hover:text-white text-base font-medium transition-colors"
            >
              View Careers
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 px-6 bg-white border-t border-gray-100">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-4 gap-12">
            {/* Brand */}
            <div className="md:col-span-2">
              <span 
                className="text-xl tracking-tight text-gray-900"
                style={{ fontFamily: "'Playfair Display', serif" }}
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

            {/* Links */}
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
                <Link href="/about" className="block text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  About
                </Link>
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
