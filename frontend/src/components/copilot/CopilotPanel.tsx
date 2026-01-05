import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCopilotSuggestions, queryCopilot, CopilotResponse } from '@/lib/api';
import { Icons } from '@/components/layout/Icons'; // Assuming Icons are available

interface CopilotPanelProps {
  clientId: string;
  projectId?: string;
  isOpen: boolean;
  onClose: () => void;
}

export const CopilotPanel: React.FC<CopilotPanelProps> = ({ clientId, projectId, isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [lastResponse, setLastResponse] = useState<CopilotResponse | null>(null);
  const [isQuerying, setIsQuerying] = useState(false);

  const { data: suggestions, isLoading: loadingSuggestions } = useQuery({
    queryKey: ['copilot', 'suggestions', clientId, projectId],
    queryFn: () => getCopilotSuggestions(clientId, projectId),
    enabled: isOpen,
  });

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsQuerying(true);
    try {
      const response = await queryCopilot(query, clientId, projectId);
      setLastResponse(response);
      setQuery('');
    } catch (error) {
      console.error('Copilot error:', error);
    } finally {
      setIsQuerying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <aside className="fixed right-0 top-0 h-screen w-96 bg-card border-l border-border shadow-2xl z-50 flex flex-col animate-slide-in-right">
      <header className="p-4 border-b border-border flex items-center justify-between bg-accent/5">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-accent/20 text-accent">
            {Icons.sparkles}
          </div>
          <h2 className="font-bold text-foreground">TaxScape Copilot</h2>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
          {Icons.x}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Active Suggestions */}
        <section>
          <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-widest mb-3">Priority Insights</h3>
          {loadingSuggestions ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-20 bg-muted rounded-xl" />
              <div className="h-20 bg-muted rounded-xl" />
            </div>
          ) : suggestions?.length ? (
            <div className="space-y-3">
              {suggestions.map((s: any) => (
                <div key={s.id} className={`p-4 rounded-xl border-l-4 shadow-sm ${
                  s.severity === 'critical' ? 'bg-destructive/5 border-destructive' :
                  s.severity === 'warning' ? 'bg-warning/5 border-warning' : 'bg-accent/5 border-accent'
                }`}>
                  <p className="text-sm font-medium text-foreground">{s.summary}</p>
                  {s.suggested_actions?.length > 0 && (
                    <button className="mt-2 text-xs font-bold text-accent hover:underline flex items-center gap-1">
                      Resolve Now {Icons.arrowRight}
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No critical blockers identified. You&apos;re on track!</p>
          )}
        </section>

        {/* AI Response Display */}
        {lastResponse && (
          <section className="bg-accent/5 p-4 rounded-xl border border-accent/20 space-y-4">
            <div className="flex items-start justify-between">
              <p className="text-sm text-foreground leading-relaxed">{lastResponse.summary}</p>
              <span className="text-[10px] bg-accent/20 text-accent px-2 py-0.5 rounded-full font-bold">
                {Math.round(lastResponse.confidence * 100)}% Match
              </span>
            </div>
            
            {lastResponse.citations.length > 0 && (
              <div className="pt-2">
                <p className="text-[10px] uppercase font-bold text-muted-foreground mb-2">Grounded Citations</p>
                <div className="flex flex-wrap gap-2">
                  {lastResponse.citations.map((c, i) => (
                    <div key={i} className="text-[10px] bg-muted px-2 py-1 rounded border border-border cursor-pointer hover:border-accent">
                      {Icons.fileText} {c.location || 'Ref'}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      <footer className="p-4 border-t border-border bg-accent/5">
        <form onSubmit={handleQuery} className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask anything about this project..."
            className="w-full bg-background border border-border rounded-xl px-4 py-3 pr-12 focus:ring-2 focus:ring-accent/20 outline-none text-sm"
            disabled={isQuerying}
          />
          <button 
            type="submit"
            className="absolute right-2 top-2 p-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
            disabled={isQuerying}
          >
            {isQuerying ? Icons.loader : Icons.send}
          </button>
        </form>
        <p className="text-[10px] text-center text-muted-foreground mt-3">
          Copilot is grounded in project evidence. Actions require your final approval.
        </p>
      </footer>
    </aside>
  );
};

