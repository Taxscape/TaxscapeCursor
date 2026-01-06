"use client";

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getProjectsExtended, getProjectGaps, getProjectEvidence, getLatestEvaluation } from '@/lib/api';
import { useActiveContext } from '@/context/workspace-context';
import { ProjectQualificationTab, GapResolutionPanel, EvidenceViewer } from '@/components/workspace';
import { 
  ArrowLeft, 
  Target, 
  FileText, 
  ListTodo, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  Edit,
  Settings,
  Building,
  Calendar,
  User,
} from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

type TabId = 'overview' | 'qualification' | 'gaps' | 'evidence' | 'questionnaire' | 'settings';

// =============================================================================
// TAB CONFIGURATION
// =============================================================================

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <FileText className="w-4 h-4" /> },
  { id: 'qualification', label: 'Qualification', icon: <Target className="w-4 h-4" /> },
  { id: 'gaps', label: 'Gaps', icon: <ListTodo className="w-4 h-4" /> },
  { id: 'evidence', label: 'Evidence', icon: <FileText className="w-4 h-4" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
];

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const { clientId, taxYear: taxYearStr } = useActiveContext();
  const taxYear = parseInt(taxYearStr || '2024', 10);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // Fetch project
  const { data: projectsData, isLoading: projectLoading } = useQuery({
    queryKey: ['projects-extended', clientId, taxYear],
    queryFn: () => getProjectsExtended(clientId!, taxYear),
    enabled: !!clientId,
  });

  // Fetch gaps
  const { data: gapsData, refetch: refetchGaps } = useQuery({
    queryKey: ['gaps', projectId, taxYear],
    queryFn: () => getProjectGaps({ projectId, taxYear }),
    enabled: !!projectId,
  });

  // Fetch evidence
  const { data: evidenceData } = useQuery({
    queryKey: ['evidence', projectId],
    queryFn: () => getProjectEvidence(projectId),
    enabled: !!projectId,
  });

  // Fetch evaluation
  const { data: evalData } = useQuery({
    queryKey: ['evaluation', projectId, taxYear],
    queryFn: () => getLatestEvaluation(projectId, taxYear),
    enabled: !!projectId,
  });

  const project = projectsData?.data?.find(p => p.id === projectId);
  const gaps = gapsData?.data || [];
  const evidence = evidenceData?.data || [];
  const evaluation = evalData?.data;
  const openGapsCount = gaps.filter(g => g.status === 'open' || g.status === 'in_progress').length;

  if (projectLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <AlertTriangle className="w-12 h-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">Project Not Found</h2>
        <p className="text-muted-foreground mb-4">The project you&apos;re looking for doesn&apos;t exist or you don&apos;t have access.</p>
        <button
          onClick={() => router.push('/workspace/projects')}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground rounded-lg"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Projects
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => router.push('/workspace/projects')}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
              {/* Qualification Badge */}
              {evaluation?.qualified_boolean ? (
                <span className="px-2 py-1 text-xs font-medium bg-green-500/20 text-green-600 rounded-full flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  Qualified
                </span>
              ) : evaluation?.status === 'needs_review' ? (
                <span className="px-2 py-1 text-xs font-medium bg-yellow-500/20 text-yellow-600 rounded-full flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Review
                </span>
              ) : (
                <span className="px-2 py-1 text-xs font-medium bg-muted text-muted-foreground rounded-full flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Pending
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {project.product_line || 'No product line'} • Tax Year {taxYear}
            </p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80">
            <Edit className="w-4 h-4" />
            Edit
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 -mb-px">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-accent text-accent bg-accent/5'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.id === 'gaps' && openGapsCount > 0 && (
                <span className="px-1.5 py-0.5 text-xs bg-red-500/20 text-red-600 rounded-full">
                  {openGapsCount}
                </span>
              )}
              {tab.id === 'evidence' && evidence.length > 0 && (
                <span className="px-1.5 py-0.5 text-xs bg-muted text-muted-foreground rounded-full">
                  {evidence.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-card border border-border">
                <p className="text-sm text-muted-foreground">Qualification Status</p>
                <p className={`text-xl font-bold ${
                  evaluation?.qualified_boolean ? 'text-green-500' : 
                  evaluation?.status === 'needs_review' ? 'text-yellow-500' : 'text-muted-foreground'
                }`}>
                  {evaluation?.qualified_boolean ? 'Qualified' : 
                   evaluation?.status === 'needs_review' ? 'Review Needed' : 'Not Evaluated'}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-card border border-border">
                <p className="text-sm text-muted-foreground">Four-Part Test</p>
                <p className="text-xl font-bold text-foreground">
                  {evaluation?.four_part_test_json ? 
                    `${Object.values(evaluation.four_part_test_json).filter((t: any) => t.status === 'pass').length}/4` : 
                    'N/A'}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-card border border-border">
                <p className="text-sm text-muted-foreground">Open Gaps</p>
                <p className={`text-xl font-bold ${openGapsCount > 0 ? 'text-yellow-500' : 'text-green-500'}`}>
                  {openGapsCount}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-card border border-border">
                <p className="text-sm text-muted-foreground">Evidence Docs</p>
                <p className="text-xl font-bold text-foreground">{evidence.length}</p>
              </div>
            </div>

            {/* Project Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column */}
              <div className="space-y-4">
                <div className="p-5 rounded-xl bg-card border border-border">
                  <h3 className="font-semibold text-foreground mb-3">Project Information</h3>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <Building className="w-4 h-4 text-muted-foreground mt-1" />
                      <div>
                        <p className="text-xs text-muted-foreground">Product Line</p>
                        <p className="text-sm text-foreground">{project.product_line || 'Not specified'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Calendar className="w-4 h-4 text-muted-foreground mt-1" />
                      <div>
                        <p className="text-xs text-muted-foreground">Project Period</p>
                        <p className="text-sm text-foreground">
                          {project.start_date ? new Date(project.start_date).toLocaleDateString() : 'N/A'} - 
                          {project.end_date ? new Date(project.end_date).toLocaleDateString() : 'Ongoing'}
                        </p>
                      </div>
                    </div>
                    {project.budget && (
                      <div className="flex items-start gap-3">
                        <FileText className="w-4 h-4 text-muted-foreground mt-1" />
                        <div>
                          <p className="text-xs text-muted-foreground">Budget</p>
                          <p className="text-sm text-foreground">${project.budget.toLocaleString()}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Description */}
                <div className="p-5 rounded-xl bg-card border border-border">
                  <h3 className="font-semibold text-foreground mb-3">Description</h3>
                  <p className="text-sm text-muted-foreground">
                    {project.description || 'No description provided.'}
                  </p>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-4">
                {/* Technical Uncertainty */}
                <div className="p-5 rounded-xl bg-card border border-border">
                  <h3 className="font-semibold text-foreground mb-3">Technical Uncertainty</h3>
                  <p className="text-sm text-muted-foreground">
                    {project.technical_uncertainty || 'Not documented. This is required for qualification.'}
                  </p>
                </div>

                {/* Process of Experimentation */}
                <div className="p-5 rounded-xl bg-card border border-border">
                  <h3 className="font-semibold text-foreground mb-3">Process of Experimentation</h3>
                  <p className="text-sm text-muted-foreground">
                    {project.process_of_experimentation || 'Not documented. This is required for qualification.'}
                  </p>
                </div>

                {/* AI Summary */}
                {evaluation?.ai_summary && (
                  <div className="p-5 rounded-xl bg-accent/5 border border-accent/20">
                    <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Target className="w-4 h-4 text-accent" />
                      AI Assessment
                    </h3>
                    <p className="text-sm text-foreground">{evaluation.ai_summary}</p>
                    {evaluation.confidence_score !== undefined && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Confidence</span>
                          <span className="font-medium">{Math.round(evaluation.confidence_score * 100)}%</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              evaluation.confidence_score >= 0.7 ? 'bg-green-500' :
                              evaluation.confidence_score >= 0.4 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${evaluation.confidence_score * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Qualification Tab */}
        {activeTab === 'qualification' && (
          <ProjectQualificationTab 
            projectId={projectId} 
            projectName={project.name} 
            taxYear={taxYear} 
          />
        )}

        {/* Gaps Tab */}
        {activeTab === 'gaps' && (
          <GapResolutionPanel 
            gaps={gaps} 
            projectId={projectId}
            onGapUpdated={() => refetchGaps()}
            userRole="cpa" // TODO: Get from auth context
          />
        )}

        {/* Evidence Tab */}
        {activeTab === 'evidence' && (
          <div className="h-[calc(100vh-280px)]">
            <EvidenceViewer 
              projectId={projectId}
              clientId={clientId ?? undefined}
              mode="list"
            />
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl space-y-6">
            <div className="p-6 rounded-xl bg-card border border-border">
              <h3 className="font-semibold text-foreground mb-4">Project Settings</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground block mb-2">Project Name</label>
                  <input
                    type="text"
                    defaultValue={project.name}
                    className="w-full px-4 py-2 rounded-lg border border-border bg-background"
                    disabled
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground block mb-2">Natural ID</label>
                  <input
                    type="text"
                    defaultValue={project.project_id_natural || ''}
                    className="w-full px-4 py-2 rounded-lg border border-border bg-background"
                    disabled
                  />
                </div>
              </div>
            </div>

            <div className="p-6 rounded-xl bg-red-500/5 border border-red-500/30">
              <h3 className="font-semibold text-red-600 mb-2">Danger Zone</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Deleting a project is permanent and cannot be undone.
              </p>
              <button className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600">
                Delete Project
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

