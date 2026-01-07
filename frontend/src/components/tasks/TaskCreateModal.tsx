"use client";

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createTask, TaskType, TaskPriority, TaskCreatePayload } from '@/lib/api';

interface TaskCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  projectId?: string;
  criterionKey?: string;
  defaultTaskType?: TaskType;
  teamMembers?: { id: string; full_name: string; cpa_role: string }[];
}

const taskTypeOptions: { value: TaskType; label: string; description: string }[] = [
  { value: 'request_project_narrative', label: 'Project Narrative', description: 'Request a complete project narrative describing R&D activities' },
  { value: 'request_process_of_experimentation_details', label: 'Experimentation Details', description: 'Request details about the experimentation process' },
  { value: 'request_uncertainty_statement', label: 'Uncertainty Statement', description: 'Request documentation of technical uncertainty' },
  { value: 'request_technical_document_upload', label: 'Technical Document', description: 'Request upload of technical documents (specs, designs, etc.)' },
  { value: 'request_test_results_upload', label: 'Test Results', description: 'Request upload of test results and benchmarks' },
  { value: 'resolve_financial_anomaly', label: 'Financial Anomaly', description: 'Resolve a detected financial inconsistency' },
  { value: 'verify_employee_allocation', label: 'Employee Allocation', description: 'Verify employee time allocation to R&D' },
  { value: 'verify_contractor_qualification', label: 'Contractor Qualification', description: 'Verify contractor qualification for R&D credit' },
  { value: 'confirm_supply_eligibility', label: 'Supply Eligibility', description: 'Confirm supply expense eligibility' },
  { value: 'review_ai_evaluation', label: 'AI Evaluation Review', description: 'Review and validate AI-generated evaluation' },
  { value: 'final_review_and_signoff', label: 'Final Review', description: 'Final review and partner signoff' },
  { value: 'generic', label: 'General Task', description: 'A general-purpose task' },
];

const priorityOptions: { value: TaskPriority; label: string; color: string }[] = [
  { value: 'low', label: 'Low', color: 'bg-slate-100 text-slate-700' },
  { value: 'medium', label: 'Medium', color: 'bg-blue-100 text-blue-700' },
  { value: 'high', label: 'High', color: 'bg-amber-100 text-amber-700' },
  { value: 'urgent', label: 'Urgent', color: 'bg-red-100 text-red-700' },
];

export const TaskCreateModal: React.FC<TaskCreateModalProps> = ({
  isOpen,
  onClose,
  clientId,
  projectId,
  criterionKey,
  defaultTaskType,
  teamMembers = [],
}) => {
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    task_type: defaultTaskType || 'generic' as TaskType,
    title: '',
    description: '',
    priority: 'medium' as TaskPriority,
    due_date: '',
    assigned_to: '',
  });

  const createMutation = useMutation({
    mutationFn: (payload: TaskCreatePayload) => createTask(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      onClose();
      setFormData({
        task_type: 'generic',
        title: '',
        description: '',
        priority: 'medium',
        due_date: '',
        assigned_to: '',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const payload: TaskCreatePayload = {
      client_id: clientId,
      project_id: projectId,
      criterion_key: criterionKey,
      task_type: formData.task_type,
      title: formData.title,
      description: formData.description || undefined,
      priority: formData.priority,
      due_date: formData.due_date || undefined,
      assigned_to: formData.assigned_to || undefined,
    };
    
    createMutation.mutate(payload);
  };

  const selectedTaskType = taskTypeOptions.find(t => t.value === formData.task_type);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-foreground">Create Task</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Assign a structured task to your team
              </p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Task Type */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Task Type</label>
            <select
              value={formData.task_type}
              onChange={(e) => setFormData(prev => ({ ...prev, task_type: e.target.value as TaskType }))}
              className="input w-full"
            >
              {taskTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {selectedTaskType && (
              <p className="text-xs text-muted-foreground mt-1">{selectedTaskType.description}</p>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="e.g., Upload Q4 technical documentation"
              className="input w-full"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Provide details about what's needed..."
              className="input w-full min-h-[100px]"
            />
          </div>

          {/* Priority & Due Date Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Priority</label>
              <div className="flex flex-wrap gap-2">
                {priorityOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, priority: option.value }))}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      formData.priority === option.value
                        ? option.color + ' ring-2 ring-offset-2 ring-accent'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Due Date</label>
              <input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData(prev => ({ ...prev, due_date: e.target.value }))}
                className="input w-full"
                min={new Date().toISOString().split('T')[0]}
              />
              <p className="text-xs text-muted-foreground mt-1">Leave empty for auto SLA</p>
            </div>
          </div>

          {/* Assignee */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Assign To</label>
            <select
              value={formData.assigned_to}
              onChange={(e) => setFormData(prev => ({ ...prev, assigned_to: e.target.value }))}
              className="input w-full"
            >
              <option value="">Auto-route based on task type</option>
              {teamMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name} ({member.cpa_role})
                </option>
              ))}
            </select>
          </div>

          {/* Context Info */}
          {(projectId || criterionKey) && (
            <div className="bg-accent/5 p-3 rounded-lg border border-accent/20">
              <p className="text-xs font-medium text-accent uppercase tracking-wider mb-1">Task Context</p>
              <p className="text-sm text-foreground">
                {projectId && <span>Project: {projectId.slice(0, 8)}...</span>}
                {criterionKey && <span className="ml-2">• Criterion: {criterionKey.replace(/_/g, ' ')}</span>}
              </p>
            </div>
          )}

          {/* Error Message */}
          {createMutation.isError && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">
              {(createMutation.error as Error).message}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn btn-outline">
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={!formData.title.trim() || createMutation.isPending}
              className="btn btn-primary"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskCreateModal;




