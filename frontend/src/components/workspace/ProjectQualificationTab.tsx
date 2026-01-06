"use client";

import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  evaluateProject, 
  getLatestEvaluation, 
  getProjectGaps,
  getProjectEvidence,
  uploadEvidence,
  draftNarrative,
  getNextBestActions,
} from '@/lib/api';
import type { 
  ProjectAIEvaluation, 
  ProjectGap, 
  ProjectEvidenceItem,
  TestStatus,
  FourPartTestJson,
} from '@/lib/types';
import { 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  HelpCircle,
  Upload,
  FileText,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Target,
  ListTodo,
  ArrowRight,
} from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

interface ProjectQualificationTabProps {
  projectId: string;
  projectName: string;
  taxYear?: number;
}

// =============================================================================
// STATUS HELPERS
// =============================================================================

const TEST_LABELS = {
  permitted_purpose: "Permitted Purpose",
  elimination_uncertainty: "Elimination of Uncertainty",
  process_experimentation: "Process of Experimentation",
  technological_nature: "Technological in Nature",
};

const TEST_DESCRIPTIONS = {
  permitted_purpose: "Does the activity aim to develop new or improved function, performance, reliability, or quality?",
  elimination_uncertainty: "Is there uncertainty concerning the capability, method, or design at the outset?",
  process_experimentation: "Does the process involve systematic trial and error, modeling, or simulation?",
  technological_nature: "Does the process rely on principles of physical science, biology, engineering, or computer science?",
};

function getStatusIcon(status: TestStatus) {
  switch (status) {
    case 'pass':
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    case 'fail':
      return <XCircle className="w-5 h-5 text-red-500" />;
    case 'needs_review':
      return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
    default:
      return <HelpCircle className="w-5 h-5 text-muted-foreground" />;
  }
}

function getStatusColor(status: TestStatus) {
  switch (status) {
    case 'pass':
      return 'bg-green-500/10 border-green-500/30 text-green-600';
    case 'fail':
      return 'bg-red-500/10 border-red-500/30 text-red-600';
    case 'needs_review':
      return 'bg-yellow-500/10 border-yellow-500/30 text-yellow-600';
    default:
      return 'bg-muted border-border text-muted-foreground';
  }
}

function getStatusLabel(status: TestStatus) {
  switch (status) {
    case 'pass': return 'Pass';
    case 'fail': return 'Fail';
    case 'needs_review': return 'Review';
    default: return 'Missing';
  }
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ProjectQualificationTab({ projectId, projectName, taxYear = 2024 }: ProjectQualificationTabProps) {
  const queryClient = useQueryClient();
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());
  const [showGapDetails, setShowGapDetails] = useState(false);

  // Fetch latest evaluation
  const { data: evalData, isLoading: evalLoading, error: evalError } = useQuery({
    queryKey: ['evaluation', projectId, taxYear],
    queryFn: () => getLatestEvaluation(projectId, taxYear),
  });

  // Fetch gaps
  const { data: gapsData } = useQuery({
    queryKey: ['gaps', projectId, taxYear],
    queryFn: () => getProjectGaps({ projectId, taxYear }),
  });

  // Fetch evidence
  const { data: evidenceData } = useQuery({
    queryKey: ['evidence', projectId],
    queryFn: () => getProjectEvidence(projectId),
  });

  // Fetch next best actions
  const { data: nbaData } = useQuery({
    queryKey: ['next-best-actions', projectId],
    queryFn: () => getNextBestActions({ projectId, taxYear }),
  });

  // Evaluate mutation
  const evaluateMutation = useMutation({
    mutationFn: () => evaluateProject({ projectId, taxYear, force: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluation', projectId] });
      queryClient.invalidateQueries({ queryKey: ['gaps', projectId] });
      queryClient.invalidateQueries({ queryKey: ['next-best-actions', projectId] });
    },
  });

  // Upload evidence mutation
  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadEvidence({ file, projectId, evidenceType: 'technical_docs' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence', projectId] });
    },
  });

  // Draft narrative mutation
  const narrativeMutation = useMutation({
    mutationFn: () => draftNarrative({ projectId, narrativeType: 'full_narrative' }),
  });

  const evaluation = evalData?.data;
  const gaps = gapsData?.data || [];
  const evidence = evidenceData?.data || [];
  const nextBestActions = nbaData?.actions || [];
  const openGaps = gaps.filter(g => g.status === 'open' || g.status === 'in_progress');

  const toggleTest = (testKey: string) => {
    setExpandedTests(prev => {
      const next = new Set(prev);
      if (next.has(testKey)) {
        next.delete(testKey);
      } else {
        next.add(testKey);
      }
      return next;
    });
  };

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
  }, [uploadMutation]);

  // No evaluation yet
  if (!evaluation && !evalLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-6">
          <Target className="w-10 h-10 text-muted-foreground" />
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-2">Not Yet Evaluated</h3>
        <p className="text-muted-foreground text-center max-w-md mb-6">
          This project hasn&apos;t been evaluated against the IRS Four-Part Test.
          Run an AI evaluation to check qualification status.
        </p>
        <button
          onClick={() => evaluateMutation.mutate()}
          disabled={evaluateMutation.isPending}
          className="flex items-center gap-2 px-6 py-3 bg-accent text-accent-foreground rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {evaluateMutation.isPending ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              Evaluating...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Run AI Evaluation
            </>
          )}
        </button>
        {evaluateMutation.isError && (
          <p className="mt-4 text-red-500 text-sm">
            {(evaluateMutation.error as Error)?.message || 'Evaluation failed'}
          </p>
        )}
      </div>
    );
  }

  if (evalLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  const fpt = evaluation?.four_part_test_json;
  const passCount = fpt ? [
    fpt.permitted_purpose?.status,
    fpt.elimination_uncertainty?.status,
    fpt.process_experimentation?.status,
    fpt.technological_nature?.status,
  ].filter(s => s === 'pass').length : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Four-Part Test Qualification</h2>
          <p className="text-muted-foreground">
            IRS Section 41 evaluation for {projectName}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => evaluateMutation.mutate()}
            disabled={evaluateMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${evaluateMutation.isPending ? 'animate-spin' : ''}`} />
            Re-evaluate
          </button>
        </div>
      </div>

      {/* Overall Status Card */}
      <div className={`rounded-xl border p-6 ${
        evaluation?.qualified_boolean 
          ? 'bg-green-500/5 border-green-500/30' 
          : evaluation?.status === 'needs_review'
            ? 'bg-yellow-500/5 border-yellow-500/30'
            : 'bg-muted/30 border-border'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
              evaluation?.qualified_boolean 
                ? 'bg-green-500/20' 
                : evaluation?.status === 'needs_review'
                  ? 'bg-yellow-500/20'
                  : 'bg-muted'
            }`}>
              {evaluation?.qualified_boolean ? (
                <CheckCircle className="w-8 h-8 text-green-500" />
              ) : evaluation?.status === 'needs_review' ? (
                <AlertTriangle className="w-8 h-8 text-yellow-500" />
              ) : (
                <HelpCircle className="w-8 h-8 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Qualification Status</p>
              <h3 className="text-2xl font-bold text-foreground">
                {evaluation?.qualified_boolean ? 'Qualified' : evaluation?.status === 'needs_review' ? 'Review Required' : 'Incomplete'}
              </h3>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Tests Passing</p>
            <p className="text-3xl font-bold text-foreground">{passCount}/4</p>
          </div>
        </div>

        {/* Confidence Score */}
        {evaluation?.confidence_score !== undefined && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted-foreground">Confidence Score</span>
              <span className="font-medium text-foreground">
                {Math.round(evaluation.confidence_score * 100)}%
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all ${
                  evaluation.confidence_score >= 0.7 ? 'bg-green-500' :
                  evaluation.confidence_score >= 0.4 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${evaluation.confidence_score * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* AI Summary */}
        {evaluation?.ai_summary && (
          <div className="mt-4 p-4 rounded-lg bg-background/50 border border-border">
            <p className="text-sm font-medium text-foreground mb-1 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              AI Assessment
            </p>
            <p className="text-sm text-muted-foreground">{evaluation.ai_summary}</p>
          </div>
        )}
      </div>

      {/* Four Tests Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fpt && Object.entries(TEST_LABELS).map(([key, label]) => {
          const testResult = fpt[key as keyof FourPartTestJson];
          const isExpanded = expandedTests.has(key);
          
          return (
            <div 
              key={key}
              className={`rounded-xl border transition-all ${getStatusColor(testResult?.status as TestStatus)}`}
            >
              <button
                onClick={() => toggleTest(key)}
                className="w-full p-4 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(testResult?.status as TestStatus)}
                  <div>
                    <p className="font-medium">{label}</p>
                    <p className="text-xs opacity-70">{getStatusLabel(testResult?.status as TestStatus)}</p>
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5 opacity-50" />
                ) : (
                  <ChevronDown className="w-5 h-5 opacity-50" />
                )}
              </button>
              
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-current/10">
                  <p className="text-xs opacity-60 mt-3 mb-2">
                    {TEST_DESCRIPTIONS[key as keyof typeof TEST_DESCRIPTIONS]}
                  </p>
                  {testResult?.reasoning && (
                    <p className="text-sm mt-2">{testResult.reasoning}</p>
                  )}
                  {testResult?.citations && testResult.citations.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {testResult.citations.map((citation, idx) => (
                        <span 
                          key={idx}
                          className="px-2 py-1 text-xs bg-background/50 rounded-full"
                        >
                          📎 {citation.type}: {citation.id?.slice(0, 8)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Missing Information */}
      {evaluation?.missing_info && evaluation.missing_info.length > 0 && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-5">
          <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            Missing Information
          </h3>
          <ul className="space-y-2">
            {evaluation.missing_info.map((info, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-foreground">
                <span className="text-yellow-500 mt-0.5">•</span>
                {info}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Open Gaps */}
      {openGaps.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <button
            onClick={() => setShowGapDetails(!showGapDetails)}
            className="w-full flex items-center justify-between"
          >
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <ListTodo className="w-5 h-5 text-accent" />
              Open Gaps ({openGaps.length})
            </h3>
            {showGapDetails ? (
              <ChevronUp className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            )}
          </button>
          
          {showGapDetails && (
            <div className="mt-4 space-y-3">
              {openGaps.map(gap => (
                <div 
                  key={gap.id}
                  className={`p-4 rounded-lg border ${
                    gap.severity === 'critical' ? 'border-red-500/30 bg-red-500/5' :
                    gap.severity === 'high' ? 'border-orange-500/30 bg-orange-500/5' :
                    gap.severity === 'medium' ? 'border-yellow-500/30 bg-yellow-500/5' :
                    'border-border bg-muted/30'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                        gap.severity === 'critical' ? 'bg-red-500/20 text-red-600' :
                        gap.severity === 'high' ? 'bg-orange-500/20 text-orange-600' :
                        gap.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-600' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {gap.severity}
                      </span>
                      <h4 className="font-medium text-foreground mt-2">{gap.title}</h4>
                      {gap.description && (
                        <p className="text-sm text-muted-foreground mt-1">{gap.description}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{gap.status}</span>
                  </div>
                  {gap.required_info && gap.required_info.length > 0 && (
                    <div className="mt-3 text-xs text-muted-foreground">
                      <p className="font-medium">Required:</p>
                      <ul className="mt-1 list-disc list-inside">
                        {gap.required_info.map((info, idx) => (
                          <li key={idx}>{info}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Next Best Actions */}
      {nextBestActions.length > 0 && (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-5">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" />
            Recommended Next Steps
          </h3>
          <div className="space-y-2">
            {nextBestActions.slice(0, 5).map((action, idx) => (
              <div 
                key={idx}
                className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border"
              >
                <div className="flex items-center gap-3">
                  <ArrowRight className="w-4 h-4 text-accent" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{action.target}</p>
                    <p className="text-xs text-muted-foreground">{action.reason}</p>
                  </div>
                </div>
                <span className={`px-2 py-1 text-xs rounded-full ${
                  action.estimated_effort === 'S' ? 'bg-green-500/20 text-green-600' :
                  action.estimated_effort === 'M' ? 'bg-yellow-500/20 text-yellow-600' :
                  'bg-red-500/20 text-red-600'
                }`}>
                  {action.estimated_effort === 'S' ? 'Quick' : action.estimated_effort === 'M' ? 'Medium' : 'Long'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Evidence & Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Evidence Count */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-muted-foreground" />
            Supporting Evidence
          </h3>
          <p className="text-3xl font-bold text-foreground mb-2">{evidence.length}</p>
          <p className="text-sm text-muted-foreground mb-4">
            {evidence.length === 0 ? 'No evidence uploaded yet' : `${evidence.length} document(s) attached`}
          </p>
          <label className="flex items-center justify-center gap-2 px-4 py-2 border border-dashed border-border rounded-lg cursor-pointer hover:border-accent hover:bg-accent/5 transition-colors">
            <Upload className="w-4 h-4" />
            <span className="text-sm">Upload Evidence</span>
            <input 
              type="file" 
              className="hidden" 
              accept=".pdf,.docx,.doc,.xlsx,.xls,.txt"
              onChange={handleFileUpload}
              disabled={uploadMutation.isPending}
            />
          </label>
          {uploadMutation.isPending && (
            <p className="text-xs text-muted-foreground mt-2 text-center">Uploading...</p>
          )}
        </div>

        {/* Draft Narrative */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" />
            AI Narrative Draft
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Generate a compliant project narrative based on available evidence and questionnaire responses.
          </p>
          <button
            onClick={() => narrativeMutation.mutate()}
            disabled={narrativeMutation.isPending}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {narrativeMutation.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Drafting...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Draft Narrative
              </>
            )}
          </button>
          {narrativeMutation.isSuccess && narrativeMutation.data && (
            <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border">
              <p className="text-xs text-muted-foreground mb-2">Draft Generated:</p>
              <p className="text-sm text-foreground line-clamp-4">
                {narrativeMutation.data.narrative_text}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Evaluation Metadata */}
      {evaluation && (
        <div className="text-xs text-muted-foreground flex items-center justify-between p-3 rounded-lg bg-muted/20">
          <div className="flex items-center gap-4">
            <span>Version {evaluation.evaluation_version}</span>
            <span>•</span>
            <span>{evaluation.model_name}</span>
            <span>•</span>
            <span>Prompt {evaluation.prompt_version}</span>
          </div>
          <span>
            {new Date(evaluation.created_at).toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}

export default ProjectQualificationTab;

