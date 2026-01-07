"use client";

import React, { useState, useEffect } from 'react';

export function DesktopRequired() {
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  
  useEffect(() => {
    const checkScreenSize = () => {
      setIsSmallScreen(window.innerWidth < 1024);
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);
  
  if (!isSmallScreen) return null;
  
  return (
    <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
          <DesktopIcon />
        </div>
        
        <h1 className="text-2xl font-bold text-foreground mb-3">
          Desktop Required
        </h1>
        
        <p className="text-muted-foreground mb-6">
          TaxScape Workspace is designed for desktop screens. Please use a device with a screen width of at least 1024px for the best experience.
        </p>
        
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <span>Current width:</span>
          <span className="font-mono bg-muted px-2 py-1 rounded">
            {typeof window !== 'undefined' ? window.innerWidth : 0}px
          </span>
        </div>
      </div>
    </div>
  );
}

function DesktopIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  );
}




