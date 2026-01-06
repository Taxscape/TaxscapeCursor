"use client";

import React, { useState } from 'react';
import { useWorkspace, useActiveContext } from '@/context/workspace-context';
import { useProjects, useCreateProject } from '@/lib/queries';

export default function ProjectsPage() {
  const { state, selectProject } = useWorkspace();
  const { clientId, taxYear } = useActiveContext();
  const { data: projects = [], isLoading, error } = useProjects(clientId, taxYear);
  const createProjectMutation = useCreateProject();
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', description: '', technical_uncertainty: '' });
  
  // No client selected
  if (!clientId) {
    return (
      <EmptyState
        title="Select a Client"
        description="Choose a client company from the header to view their projects."
        icon={<SelectClientIcon />}
      />
    );
  }
  
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createProjectMutation.mutateAsync(newProject);
      setShowCreateModal(false);
      setNewProject({ name: '', description: '', technical_uncertainty: '' });
    } catch (err) {
      console.error('Failed to create project:', err);
    }
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Projects</h1>
          <p className="text-muted-foreground">Manage R&D projects for {state.clients.find(c => c.id === clientId)?.name || 'selected client'}</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:opacity-90 transition-opacity font-medium"
        >
          + New Project
        </button>
      </div>
      
      {/* Content */}
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message="Failed to load projects" />
      ) : projects.length === 0 ? (
        <EmptyState
          title="No Projects Yet"
          description="Create your first R&D project to start tracking qualified research activities."
          icon={<ProjectsIcon />}
          action={
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:opacity-90 transition-opacity font-medium"
            >
              Create Project
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(project => (
            <div
              key={project.id}
              onClick={() => selectProject(project.id)}
              className={`bg-card rounded-xl border p-5 cursor-pointer transition-all hover:shadow-md ${
                state.selectedProjectId === project.id ? 'border-accent ring-2 ring-accent/20' : 'border-border'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-foreground">{project.name}</h3>
                <span className={`px-2 py-1 text-xs rounded-full ${
                  project.qualification_status === 'qualified' 
                    ? 'bg-green-100 text-green-700' 
                    : project.qualification_status === 'not_qualified'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {project.qualification_status}
                </span>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                {project.description || 'No description provided'}
              </p>
              <div className="text-xs text-muted-foreground">
                Created {new Date(project.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="bg-card rounded-xl border border-border shadow-lg w-full max-w-lg p-6">
            <h2 className="text-xl font-bold text-foreground mb-4">Create New Project</h2>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Project Name *</label>
                <input
                  type="text"
                  required
                  value={newProject.name}
                  onChange={e => setNewProject({ ...newProject, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:ring-2 focus:ring-accent focus:border-transparent"
                  placeholder="e.g., AI-Powered Analytics Platform"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Description</label>
                <textarea
                  value={newProject.description}
                  onChange={e => setNewProject({ ...newProject, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:ring-2 focus:ring-accent focus:border-transparent h-24"
                  placeholder="Brief description of the project..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Technical Uncertainty</label>
                <textarea
                  value={newProject.technical_uncertainty}
                  onChange={e => setNewProject({ ...newProject, technical_uncertainty: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:ring-2 focus:ring-accent focus:border-transparent h-24"
                  placeholder="What technical challenges did you face?"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createProjectMutation.isPending}
                  className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {createProjectMutation.isPending ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Shared components
function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="text-center py-12">
      <p className="text-destructive">{message}</p>
    </div>
  );
}

function EmptyState({ title, description, icon, action }: { title: string; description: string; icon: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-md mx-auto">{description}</p>
      {action}
    </div>
  );
}

function SelectClientIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
      <rect width="16" height="20" x="4" y="2" rx="2" />
      <path d="M9 22v-4h6v4" />
    </svg>
  );
}

function ProjectsIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  );
}

