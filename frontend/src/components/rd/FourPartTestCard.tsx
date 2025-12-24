"use client";

import { useState } from "react";
import type { RDProject, TestStatus, FourPartTestResult } from "@/lib/api";

interface FourPartTestCardProps {
  project: RDProject;
  onReEvaluate?: (projectId: string) => void;
  isEvaluating?: boolean;
}

const TEST_LABELS = {
  permitted_purpose: "Permitted Purpose",
  elimination_uncertainty: "Elimination of Uncertainty",
  process_experimentation: "Process of Experimentation",
  technological_nature: "Technological in Nature",
};

const TEST_DESCRIPTIONS = {
  permitted_purpose: "Does the project aim to develop new or improved function, performance, reliability, or quality?",
  elimination_uncertainty: "Is there uncertainty concerning the development or improvement at the outset?",
  process_experimentation: "Does the process involve systematic trial and error, modeling, or simulation?",
  technological_nature: "Does the process rely on principles of physical science, biology, engineering, or computer science?",
};

function getStatusColor(status: TestStatus): string {
  switch (status) {
    case "pass":
      return "bg-success text-success-foreground";
    case "fail":
      return "bg-destructive text-destructive-foreground";
    case "needs_review":
      return "bg-warning text-warning-foreground";
    case "missing_data":
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getStatusIcon(status: TestStatus): JSX.Element {
  switch (status) {
    case "pass":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    case "fail":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      );
    case "needs_review":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 9v4M12 17h.01" />
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
    case "missing_data":
    default:
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
      );
  }
}

function getStatusLabel(status: TestStatus): string {
  switch (status) {
    case "pass":
      return "Pass";
    case "fail":
      return "Fail";
    case "needs_review":
      return "Review";
    case "missing_data":
    default:
      return "Missing";
  }
}

export function FourPartTestCard({ project, onReEvaluate, isEvaluating }: FourPartTestCardProps) {
  const [expanded, setExpanded] = useState(false);
  const fpt = project.four_part_test;
  
  const tests: Array<{ key: keyof FourPartTestResult; status: TestStatus; reasoning: string }> = [
    { 
      key: "permitted_purpose", 
      status: fpt.permitted_purpose as TestStatus, 
      reasoning: fpt.permitted_purpose_reasoning || ""
    },
    { 
      key: "elimination_uncertainty", 
      status: fpt.elimination_uncertainty as TestStatus, 
      reasoning: fpt.elimination_uncertainty_reasoning || ""
    },
    { 
      key: "process_experimentation", 
      status: fpt.process_experimentation as TestStatus, 
      reasoning: fpt.process_experimentation_reasoning || ""
    },
    { 
      key: "technological_nature", 
      status: fpt.technological_nature as TestStatus, 
      reasoning: fpt.technological_nature_reasoning || ""
    },
  ];
  
  const passCount = tests.filter(t => t.status === "pass").length;
  const needsReviewCount = tests.filter(t => t.status === "needs_review").length;
  const missingCount = tests.filter(t => t.status === "missing_data").length;

  return (
    <div className={`rounded-xl border transition-all ${
      project.qualified 
        ? "border-success/50 bg-success/5" 
        : needsReviewCount > 0 
          ? "border-warning/50 bg-warning/5" 
          : missingCount > 0
            ? "border-muted"
            : "border-destructive/50 bg-destructive/5"
    }`}>
      {/* Header */}
      <div 
        className="p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">{project.project_name}</h3>
            {project.category && (
              <p className="text-xs text-muted-foreground mt-0.5">{project.category}</p>
            )}
          </div>
          
          {/* Status Badge */}
          <div className={`px-2 py-1 rounded-md text-xs font-medium ${
            project.qualified 
              ? "bg-success/20 text-success" 
              : needsReviewCount > 0 
                ? "bg-warning/20 text-warning" 
                : "bg-muted text-muted-foreground"
          }`}>
            {project.qualified ? "Qualified" : needsReviewCount > 0 ? "Review" : "Incomplete"}
          </div>
        </div>
        
        {/* Test Indicators */}
        <div className="flex items-center gap-1.5 mt-3">
          {tests.map((test, idx) => (
            <div
              key={test.key}
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${getStatusColor(test.status)}`}
              title={`${TEST_LABELS[test.key as keyof typeof TEST_LABELS]}: ${getStatusLabel(test.status)}`}
            >
              {getStatusIcon(test.status)}
            </div>
          ))}
          <div className="ml-2 text-sm text-muted-foreground">
            {passCount}/4
          </div>
          
          {/* Expand Icon */}
          <div className="ml-auto">
            <svg 
              width="18" 
              height="18" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
              className={`text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>
        
        {/* Confidence Score */}
        {project.confidence_score > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full ${
                  project.confidence_score >= 0.7 ? "bg-success" :
                  project.confidence_score >= 0.4 ? "bg-warning" : "bg-destructive"
                }`}
                style={{ width: `${project.confidence_score * 100}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {Math.round(project.confidence_score * 100)}% confidence
            </span>
          </div>
        )}
      </div>
      
      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-border px-4 pb-4">
          {/* AI Summary */}
          {project.ai_summary && (
            <div className="mt-4 p-3 rounded-lg bg-accent/10 border border-accent/20">
              <p className="text-sm font-medium text-accent mb-1">AI Assessment</p>
              <p className="text-sm text-foreground">{project.ai_summary}</p>
            </div>
          )}
          
          {/* Test Details */}
          <div className="mt-4 space-y-3">
            {tests.map((test) => (
              <div key={test.key} className="p-3 rounded-lg bg-muted/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm text-foreground">
                    {TEST_LABELS[test.key as keyof typeof TEST_LABELS]}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(test.status)}`}>
                    {getStatusLabel(test.status)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  {TEST_DESCRIPTIONS[test.key as keyof typeof TEST_DESCRIPTIONS]}
                </p>
                {test.reasoning && (
                  <p className="text-sm text-foreground mt-2 pt-2 border-t border-border/50">
                    {test.reasoning}
                  </p>
                )}
              </div>
            ))}
          </div>
          
          {/* Missing Info */}
          {project.missing_info && project.missing_info.length > 0 && (
            <div className="mt-4 p-3 rounded-lg bg-warning/10 border border-warning/20">
              <p className="text-sm font-medium text-warning mb-2">Missing Information</p>
              <ul className="text-sm text-foreground space-y-1">
                {project.missing_info.map((info, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-warning mt-0.5">•</span>
                    {info}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Description */}
          {project.description && (
            <div className="mt-4">
              <p className="text-sm font-medium text-foreground mb-1">Project Description</p>
              <p className="text-sm text-muted-foreground">{project.description}</p>
            </div>
          )}
          
          {/* Re-evaluate Button */}
          {onReEvaluate && (
            <button
              onClick={() => onReEvaluate(project.project_id)}
              disabled={isEvaluating}
              className="mt-4 btn btn-outline btn-sm w-full"
            >
              {isEvaluating ? "Re-evaluating..." : "Re-evaluate with AI"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Summary component for showing overall test results
interface FourPartTestSummaryProps {
  projects: RDProject[];
}

export function FourPartTestSummary({ projects }: FourPartTestSummaryProps) {
  const qualified = projects.filter(p => p.qualified).length;
  const needsReview = projects.filter(p => {
    const fpt = p.four_part_test;
    return (
      fpt.permitted_purpose === "needs_review" ||
      fpt.elimination_uncertainty === "needs_review" ||
      fpt.process_experimentation === "needs_review" ||
      fpt.technological_nature === "needs_review"
    );
  }).length;
  const incomplete = projects.filter(p => {
    const fpt = p.four_part_test;
    return (
      fpt.permitted_purpose === "missing_data" ||
      fpt.elimination_uncertainty === "missing_data" ||
      fpt.process_experimentation === "missing_data" ||
      fpt.technological_nature === "missing_data"
    );
  }).length;

  return (
    <div className="grid grid-cols-4 gap-4">
      <div className="p-4 rounded-xl bg-muted/30 text-center">
        <p className="text-3xl font-bold text-foreground">{projects.length}</p>
        <p className="text-sm text-muted-foreground">Total Projects</p>
      </div>
      <div className="p-4 rounded-xl bg-success/10 text-center">
        <p className="text-3xl font-bold text-success">{qualified}</p>
        <p className="text-sm text-muted-foreground">Qualified</p>
      </div>
      <div className="p-4 rounded-xl bg-warning/10 text-center">
        <p className="text-3xl font-bold text-warning">{needsReview}</p>
        <p className="text-sm text-muted-foreground">Needs Review</p>
      </div>
      <div className="p-4 rounded-xl bg-muted/30 text-center">
        <p className="text-3xl font-bold text-muted-foreground">{incomplete}</p>
        <p className="text-sm text-muted-foreground">Incomplete</p>
      </div>
    </div>
  );
}
