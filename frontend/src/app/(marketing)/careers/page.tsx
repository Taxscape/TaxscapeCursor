"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function CareersPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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
            <Link href="/about" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">About</Link>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors px-4 py-2">Sign In</Link>
            <Link href="https://calendly.com/sam-taxscape/30min" target="_blank" className="inline-flex items-center justify-center px-6 py-2.5 bg-blue-600 text-white rounded-full text-sm font-semibold hover:bg-blue-700 transition-all shadow-md hover:shadow-lg">Book a Demo</Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-48 pb-32">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-5xl md:text-7xl font-black text-gray-900 mb-8 tracking-tight">
            Careers at <span className="text-blue-600">TaxScape.ai</span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 leading-relaxed mb-12">
            We&apos;re building the future of tax intelligence.
          </p>
        </div>
      </section>

      {/* Listings Section */}
      <section className="py-24 bg-gray-50 border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="bg-white p-16 rounded-[40px] shadow-sm border border-gray-100">
            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-8">
              <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">No Open Positions</h2>
            <p className="text-gray-500 text-lg">
              We don&apos;t have any current openings at the moment. Please check back later or follow us for updates.
            </p>
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
            <Link href="/careers" className="hover:text-blue-600 transition-colors text-gray-900">Careers</Link>
            <Link href="/privacy" className="hover:text-blue-600 transition-colors">Privacy Policy</Link>
          </div>
          <p className="text-sm text-gray-400 font-medium italic">
            © {new Date().getFullYear()} TaxScape.ai. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
