"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getNextBestActions,
  sendChatMessage,
  draftNarrative,
  getProjectGaps,
} from '@/lib/api';
import type { AINextBestAction, ChatMessage } from '@/lib/types';
import { 
  Sparkles, 
  X, 
  ArrowRight,
  Send,
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Target,
  ListTodo,
  PenTool,
} from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

interface CopilotSidebarProps {
  projectId?: string;
  clientCompanyId?: string;
  taxYear?: number;
  isOpen: boolean;
  onClose: () => void;
}

// =============================================================================
// CHAT MESSAGE COMPONENT
// =============================================================================

function ChatBubble({ message }: { message: { role: 'user' | 'assistant'; content: string } }) {
  return (
    <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
        message.role === 'user' 
          ? 'bg-accent text-accent-foreground rounded-br-sm' 
          : 'bg-muted text-foreground rounded-bl-sm'
      }`}>
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}

// =============================================================================
// NEXT BEST ACTION CARD
// =============================================================================

function ActionCard({ action, onAction }: { action: AINextBestAction; onAction?: () => void }) {
  const effortColors = {
    S: 'bg-green-500/20 text-green-600',
    M: 'bg-yellow-500/20 text-yellow-600',
    L: 'bg-red-500/20 text-red-600',
  };

  const typeIcons: Record<string, React.ReactNode> = {
    resolve_gap: <AlertTriangle className="w-4 h-4" />,
    re_evaluate: <Target className="w-4 h-4" />,
    answer_question: <FileText className="w-4 h-4" />,
    evaluate_project: <Sparkles className="w-4 h-4" />,
    review_gaps: <ListTodo className="w-4 h-4" />,
    upload_evidence: <FileText className="w-4 h-4" />,
  };

  return (
    <button
      onClick={onAction}
      className="w-full p-3 rounded-lg bg-background border border-border hover:border-accent/50 hover:bg-accent/5 transition-all text-left group"
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-accent/10 text-accent group-hover:bg-accent/20">
          {typeIcons[action.action_type] || <ArrowRight className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground line-clamp-1">{action.target}</p>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{action.reason}</p>
        </div>
        <span className={`px-2 py-0.5 text-[10px] rounded-full font-medium ${effortColors[action.estimated_effort]}`}>
          {action.estimated_effort === 'S' ? 'Quick' : action.estimated_effort === 'M' ? 'Medium' : 'Long'}
        </span>
      </div>
      {action.blocking && (
        <div className="mt-2 flex items-center gap-1 text-xs text-red-500">
          <AlertTriangle className="w-3 h-3" />
          <span>Blocking</span>
        </div>
      )}
    </button>
  );
}

// =============================================================================
// QUICK ACTIONS
// =============================================================================

interface QuickActionProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  isLoading?: boolean;
}

function QuickAction({ icon, label, description, onClick, isLoading }: QuickActionProps) {
  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      className="p-3 rounded-lg border border-border bg-background hover:border-accent/50 hover:bg-accent/5 transition-all text-left disabled:opacity-50"
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted text-muted-foreground">
          {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : icon}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
    </button>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function CopilotSidebar({ 
  projectId, 
  clientCompanyId, 
  taxYear = 2024, 
  isOpen, 
  onClose 
}: CopilotSidebarProps) {
  const queryClient = useQueryClient();
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [activeTab, setActiveTab] = useState<'actions' | 'chat' | 'draft'>('actions');
  const [showActions, setShowActions] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch next best actions
  const { data: nbaData, isLoading: loadingActions } = useQuery({
    queryKey: ['next-best-actions', projectId, clientCompanyId, taxYear],
    queryFn: () => getNextBestActions({ projectId, clientCompanyId, taxYear }),
    enabled: isOpen,
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch gaps count for context
  const { data: gapsData } = useQuery({
    queryKey: ['gaps', projectId],
    queryFn: () => getProjectGaps({ projectId, taxYear }),
    enabled: isOpen && !!projectId,
  });

  // Chat mutation
  const chatMutation = useMutation({
    mutationFn: (messages: ChatMessage[]) => sendChatMessage(messages),
    onSuccess: (data) => {
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    },
  });

  // Draft narrative mutation
  const narrativeMutation = useMutation({
    mutationFn: () => draftNarrative({ 
      projectId: projectId!, 
      narrativeType: 'full_narrative',
      includeEvidenceCitations: true,
    }),
  });

  const nextBestActions = nbaData?.actions || [];
  const openGaps = gapsData?.data?.filter(g => g.status === 'open' || g.status === 'in_progress') || [];
  const hasBlockingActions = nextBestActions.some(a => a.blocking);

  // Scroll to bottom of chat
  useEffect(() => {
    if (activeTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeTab]);

  // Focus input when chat tab is active
  useEffect(() => {
    if (activeTab === 'chat' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [activeTab]);

  const handleSendMessage = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || chatMutation.isPending) return;

    const userMessage: ChatMessage = { role: 'user', content: inputValue };
    setChatMessages(prev => [...prev, userMessage]);
    setInputValue('');

    chatMutation.mutate([...chatMessages, userMessage]);
  }, [inputValue, chatMessages, chatMutation]);

  const handleDraftNarrative = useCallback(() => {
    if (!projectId) return;
    narrativeMutation.mutate();
    setActiveTab('draft');
  }, [projectId, narrativeMutation]);

  if (!isOpen) return null;

  return (
    <aside className="fixed right-0 top-0 h-screen w-[400px] bg-card border-l border-border shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <header className="p-4 border-b border-border bg-accent/5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-accent to-accent/70 text-accent-foreground">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-foreground">AI Copilot</h2>
              <p className="text-xs text-muted-foreground">R&D Tax Credit Assistant</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 bg-muted/50 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('actions')}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'actions' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Actions
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'chat' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setActiveTab('draft')}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'draft' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Draft
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Actions Tab */}
        {activeTab === 'actions' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Status Banner */}
            {hasBlockingActions && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30">
                <div className="flex items-center gap-2 text-red-600 font-medium">
                  <AlertTriangle className="w-5 h-5" />
                  Blocking Issues Detected
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Some actions require immediate attention before proceeding.
                </p>
              </div>
            )}

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/30 border border-border">
                <p className="text-2xl font-bold text-foreground">{nextBestActions.length}</p>
                <p className="text-xs text-muted-foreground">Suggested Actions</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border border-border">
                <p className="text-2xl font-bold text-foreground">{openGaps.length}</p>
                <p className="text-xs text-muted-foreground">Open Gaps</p>
              </div>
            </div>

            {/* Quick Actions */}
            {projectId && (
              <div>
                <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-widest mb-3">
                  Quick Actions
                </h3>
                <div className="grid grid-cols-1 gap-2">
                  <QuickAction
                    icon={<PenTool className="w-4 h-4" />}
                    label="Draft Narrative"
                    description="AI-generated project narrative"
                    onClick={handleDraftNarrative}
                    isLoading={narrativeMutation.isPending}
                  />
                </div>
              </div>
            )}

            {/* Next Best Actions */}
            <div>
              <button
                onClick={() => setShowActions(!showActions)}
                className="w-full flex items-center justify-between mb-3"
              >
                <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-widest">
                  Recommended Next Steps
                </h3>
                {showActions ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </button>

              {showActions && (
                loadingActions ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-20 bg-muted/50 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : nextBestActions.length > 0 ? (
                  <div className="space-y-2">
                    {nextBestActions.slice(0, 8).map((action, idx) => (
                      <ActionCard key={idx} action={action} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-500" />
                    <p className="text-sm text-foreground font-medium">All Caught Up!</p>
                    <p className="text-xs text-muted-foreground">No recommended actions at this time.</p>
                  </div>
                )
              )}
            </div>

            {/* Passive Tip */}
            <div className="p-4 rounded-xl bg-accent/5 border border-accent/20">
              <div className="flex items-start gap-3">
                <Lightbulb className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">Pro Tip</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Upload supporting evidence like design docs, test results, or experiment logs to improve 
                    AI evaluation accuracy and auto-resolve gaps.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Chat Tab */}
        {activeTab === 'chat' && (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatMessages.length === 0 ? (
                <div className="text-center py-8">
                  <Sparkles className="w-10 h-10 mx-auto mb-3 text-accent" />
                  <p className="text-sm font-medium text-foreground">Ask me anything</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                    I can help with R&D tax credit questions, documentation guidance, and Four-Part Test analysis.
                  </p>
                  <div className="mt-4 space-y-2">
                    {[
                      "What qualifies as R&D for tax credits?",
                      "How do I document technical uncertainty?",
                      "What evidence supports experimentation?",
                    ].map((suggestion, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setInputValue(suggestion);
                          inputRef.current?.focus();
                        }}
                        className="block w-full text-left px-3 py-2 text-xs bg-muted/50 hover:bg-muted rounded-lg transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {chatMessages.map((msg, idx) => (
                    <ChatBubble key={idx} message={msg} />
                  ))}
                  {chatMutation.isPending && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
                        <div className="flex items-center gap-2">
                          <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Thinking...</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </>
              )}
            </div>

            {/* Chat Input */}
            <form onSubmit={handleSendMessage} className="p-4 border-t border-border shrink-0">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  placeholder="Ask about R&D tax credits..."
                  className="flex-1 px-4 py-3 rounded-xl border border-border bg-background text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none"
                  disabled={chatMutation.isPending}
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim() || chatMutation.isPending}
                  className="px-4 py-3 bg-accent text-accent-foreground rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </form>
          </>
        )}

        {/* Draft Tab */}
        {activeTab === 'draft' && (
          <div className="flex-1 overflow-y-auto p-4">
            {narrativeMutation.isPending ? (
              <div className="flex flex-col items-center justify-center py-12">
                <RefreshCw className="w-10 h-10 animate-spin text-accent mb-4" />
                <p className="text-sm font-medium text-foreground">Drafting Narrative...</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Analyzing project data and evidence
                </p>
              </div>
            ) : narrativeMutation.isSuccess && narrativeMutation.data ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-foreground">Generated Narrative</h3>
                  <span className="text-xs text-muted-foreground">
                    {narrativeMutation.data.citations.evidence_ids.length} evidence cited
                  </span>
                </div>
                <div className="p-4 rounded-xl bg-muted/30 border border-border">
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                    {narrativeMutation.data.narrative_text}
                  </p>
                </div>
                {narrativeMutation.data.citations.evidence_ids.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Citations:</p>
                    <div className="flex flex-wrap gap-2">
                      {narrativeMutation.data.citations.evidence_ids.map((id, idx) => (
                        <span key={idx} className="px-2 py-1 text-xs bg-accent/10 text-accent rounded-full">
                          📎 {id.slice(0, 8)}...
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => navigator.clipboard.writeText(narrativeMutation.data?.narrative_text || '')}
                    className="flex-1 px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:opacity-90"
                  >
                    Copy to Clipboard
                  </button>
                  <button
                    onClick={handleDraftNarrative}
                    className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted/80"
                  >
                    Regenerate
                  </button>
                </div>
              </div>
            ) : narrativeMutation.isError ? (
              <div className="text-center py-8">
                <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-red-500" />
                <p className="text-sm font-medium text-foreground">Failed to Generate</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {(narrativeMutation.error as Error)?.message || 'An error occurred'}
                </p>
                <button
                  onClick={handleDraftNarrative}
                  className="mt-4 px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:opacity-90"
                >
                  Try Again
                </button>
              </div>
            ) : (
              <div className="text-center py-12">
                <PenTool className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Narrative Drafting</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                  Generate AI-drafted project narratives based on your evidence and questionnaire responses.
                </p>
                {projectId ? (
                  <button
                    onClick={handleDraftNarrative}
                    className="mt-4 px-6 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:opacity-90"
                  >
                    Generate Narrative
                  </button>
                ) : (
                  <p className="mt-4 text-xs text-muted-foreground">
                    Select a project to draft narratives.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

export default CopilotSidebar;


