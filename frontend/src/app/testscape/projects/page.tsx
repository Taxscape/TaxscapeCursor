"use client";

import React, { useState } from 'react';
import { useActiveContext } from '@/context/workspace-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProjects, createProject, type Project } from '@/lib/api';

export default function ProjectsPage() {
  const { clientId, taxYear } = useActiveContext();
  const queryClient = useQueryClient();
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProject, setNewProject] = useState({ 
    name: '', 
    description: '', 
    technical_uncertainty: '' 
  });
  
  // Fetch projects
  const { data: projects = [], isLoading, error } = useQuery({
    queryKey: ['projects', clientId, taxYear],
    queryFn: () => getProjects(clientId!, Number(taxYear)),
    enabled: !!clientId,
  });
  
  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: typeof newProject) => createProject(data, clientId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', clientId, taxYear] });
      setShowCreateModal(false);
      setNewProject({ name: '', description: '', technical_uncertainty: '' });
    },
  });
  
  // No client selected
  if (!clientId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center mb-4">
          <FolderIcon className="w-8 h-8 text-blue-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Select a Client</h2>
        <p className="text-gray-400">Choose a client from the header to view their projects.</p>
      </div>
    );
  }
  
  // Loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(newProject);
  };
  
  const qualifiedProjects = projects.filter((p: Project) => p.qualification_status === 'qualified').length;
  const needsDetailsProjects = projects.filter((p: Project) =>
    p.qualification_status === 'needs_review'
    || p.qualification_status === 'pending_review'
    || p.qualification_status === 'pending'
    || !p.qualification_status
  ).length;
  const notQualifiedProjects = projects.filter((p: Project) => p.qualification_status === 'not_qualified').length;
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Projects</h1>
          <p className="text-gray-400">Manage R&D projects for qualification</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2"
        >
          <PlusIcon />
          Add Project
        </button>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-[#12121a] border border-white/10 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">Total Projects</p>
          <p className="text-2xl font-bold text-white">{projects.length}</p>
        </div>
        <div className="bg-[#12121a] border border-white/10 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">Qualified</p>
          <p className="text-2xl font-bold text-green-400">{qualifiedProjects}</p>
        </div>
        <div className="bg-[#12121a] border border-white/10 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">Open for More Details</p>
          <p className="text-2xl font-bold text-amber-400">{needsDetailsProjects}</p>
        </div>
        <div className="bg-[#12121a] border border-white/10 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">Not Qualified</p>
          <p className="text-2xl font-bold text-red-400">{notQualifiedProjects}</p>
        </div>
      </div>
      
      {/* Projects List */}
      <div className="bg-[#12121a] border border-white/10 rounded-xl overflow-hidden">
        {projects.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
              <FolderIcon className="w-6 h-6 text-gray-500" />
            </div>
            <p className="text-gray-400 mb-4">No projects yet</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Add First Project
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Project Name</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Description</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Status</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">QRE Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {projects.map((project: Project) => (
                <tr key={project.id} className="hover:bg-white/5">
                  <td className="py-3 px-4">
                    <p className="font-medium text-white">{project.name}</p>
                  </td>
                  <td className="py-3 px-4">
                    <p className="text-sm text-gray-400 truncate max-w-xs">
                      {project.description || 'No description'}
                    </p>
                  </td>
                  <td className="py-3 px-4">
                    {(() => {
                      const s = project.qualification_status;
                      let label = 'Open for More Details';
                      let cls = 'bg-amber-500/20 text-amber-300';
                      if (s === 'qualified') {
                        label = 'Qualified';
                        cls = 'bg-green-500/20 text-green-400';
                      } else if (s === 'not_qualified') {
                        label = 'Not Qualified';
                        cls = 'bg-red-500/20 text-red-400';
                      } else if (s === 'pending') {
                        label = 'Pending';
                        cls = 'bg-yellow-500/20 text-yellow-400';
                      }
                      return (
                        <span className={`px-2 py-1 rounded text-xs font-medium ${cls}`}>
                          {label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <p className="text-white font-medium">
                      ${(project.total_qre || 0).toLocaleString()}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      
      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#1a1a22] border border-white/10 rounded-2xl p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold text-white mb-4">Add New Project</h3>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Project Name *</label>
                <input
                  type="text"
                  value={newProject.name}
                  onChange={(e) => setNewProject(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                  placeholder="e.g., AI-Powered Analytics Engine"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Description</label>
                <textarea
                  value={newProject.description}
                  onChange={(e) => setNewProject(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white h-24"
                  placeholder="Describe the R&D activities..."
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Technical Uncertainty</label>
                <textarea
                  value={newProject.technical_uncertainty}
                  onChange={(e) => setNewProject(prev => ({ ...prev, technical_uncertainty: e.target.value }))}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white h-24"
                  placeholder="What technical challenges did you face?"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2 bg-white/5 text-white rounded-lg hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || !newProject.name}
                  className="flex-1 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Icons
function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
