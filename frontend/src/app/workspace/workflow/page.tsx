"use client";

import React from 'react';
import { useActiveContext } from '@/context/workspace-context';
import { useWorkflowSummary, useProjects } from '@/lib/queries';

export default function WorkflowPage() {
  const { clientId, taxYear } = useActiveContext();
  const { data: workflowSummary, isLoading: workflowLoading } = useWorkflowSummary(clientId);
  const { data: projects = [] } = useProjects(clientId, taxYear);
  
  if (!clientId) {
    return <EmptyState title="Select a Client" description="Choose a client company to view workflow status." />;
  }
  
  const isLoading = workflowLoading;
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Workflow Status</h1>
        <p className="text-muted-foreground">Track project qualification workflow and audit readiness</p>
      </div>
      
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !workflowSummary ? (
        <EmptyState
          title="No Workflow Data"
          description="Add projects to start tracking their qualification workflow status."
        />
      ) : (
        <>
          {/* Status Overview */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatusCard label="Not Started" count={workflowSummary.by_state?.not_started || 0} color="gray" />
            <StatusCard label="In Progress" count={workflowSummary.by_state?.in_progress || 0} color="yellow" />
            <StatusCard label="Ready for Review" count={workflowSummary.by_state?.ready_for_review || 0} color="blue" />
            <StatusCard label="Needs Follow-up" count={workflowSummary.by_state?.needs_follow_up || 0} color="orange" />
            <StatusCard label="Approved" count={workflowSummary.by_state?.approved || 0} color="green" />
          </div>
          
          {/* Top Blockers */}
          {workflowSummary.top_blockers?.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6">
              <h3 className="font-semibold text-destructive mb-3">Top Blockers</h3>
              <ul className="space-y-2">
                {workflowSummary.top_blockers.map((blocker: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="text-destructive mt-0.5">•</span>
                    {blocker}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Next Best Actions */}
          {(workflowSummary.next_best_actions?.length ?? 0) > 0 && (
            <div className="bg-card rounded-xl border border-border p-6">
              <h3 className="font-semibold text-foreground mb-4">Recommended Actions</h3>
              <div className="space-y-3">
                {workflowSummary.next_best_actions?.slice(0, 5).map((action: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <div>
                      <p className="font-medium text-foreground">{action.target}</p>
                      <p className="text-sm text-muted-foreground">{action.reason}</p>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      action.estimated_effort === 'S' ? 'bg-green-100 text-green-700' :
                      action.estimated_effort === 'M' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {action.estimated_effort}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Project Status List */}
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="font-semibold text-foreground mb-4">Project Status</h3>
            {projects.length === 0 ? (
              <p className="text-muted-foreground">No projects yet</p>
            ) : (
              <div className="space-y-2">
                {projects.map(project => {
                  const status = workflowSummary.project_statuses?.[project.id];
                  return (
                    <div key={project.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30 transition-colors">
                      <div>
                        <p className="font-medium text-foreground">{project.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Readiness: {status?.readiness_score || 0}%
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          status?.overall_state === 'approved' ? 'bg-green-100 text-green-700' :
                          status?.overall_state === 'in_progress' ? 'bg-yellow-100 text-yellow-700' :
                          status?.overall_state === 'ready_for_review' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {status?.overall_state || 'not_started'}
                        </span>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          status?.risk_level === 'low' ? 'bg-green-100 text-green-700' :
                          status?.risk_level === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {status?.risk_level || 'low'} risk
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatusCard({ label, count, color }: { label: string; count: number; color: string }) {
  const colors: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-700 border-gray-200',
    yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    orange: 'bg-orange-100 text-orange-700 border-orange-200',
    green: 'bg-green-100 text-green-700 border-green-200',
  };
  
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="text-3xl font-bold">{count}</div>
      <div className="text-sm">{label}</div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
        <WorkflowIcon />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}

function WorkflowIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

