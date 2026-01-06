import React, { useState } from 'react';
import { Icons } from '@/components/layout/Icons';

interface InlineAssistProps {
  label: string;
  context: string;
  onDraftGenerate: (draft: string) => void;
  isLoading?: boolean;
}

export const InlineAssist: React.FC<InlineAssistProps> = ({ label, context, onDraftGenerate, isLoading }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div 
      className="relative flex items-center gap-2 group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button 
        type="button"
        className={`p-1.5 rounded-md transition-all ${
          isLoading ? 'animate-spin text-accent' : 'bg-accent/10 text-accent hover:bg-accent hover:text-accent-foreground'
        }`}
        onClick={() => !isLoading && onDraftGenerate(context)}
        title={`Draft ${label} with AI`}
      >
        {Icons.sparkles}
      </button>
      
      {isHovered && !isLoading && (
        <div className="absolute left-10 top-0 w-48 p-2 bg-card border border-border rounded-lg shadow-xl z-10 animate-fade-in">
          <p className="text-[10px] font-bold text-foreground uppercase tracking-wider mb-1">AI Assistant</p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Draft a tax-compliant {label.toLowerCase()} using existing evidence items.
          </p>
        </div>
      )}
    </div>
  );
};



