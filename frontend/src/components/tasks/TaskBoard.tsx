"use client";

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getMyTasks, getClientTasks, getReviewQueue, getBlockerTasks,
  updateTaskStatus, submitTask, reviewTask, escalateTask,
  StructuredTask, TaskStatus, TaskPriority, TaskType
} from '@/lib/api';

// Icons
const Icons = {
  check: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
  clock: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  alert: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
  user: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
  arrowUp: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>,
  sparkles: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>,
};

const priorityColors: Record<TaskPriority, string> = {
  low: 'bg-slate-100 text-slate-700 border-slate-200',
  medium: 'bg-blue-50 text-blue-700 border-blue-200',
  high: 'bg-amber-50 text-amber-700 border-amber-200',
  urgent: 'bg-red-50 text-red-700 border-red-200',
};

const statusColors: Record<TaskStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  assigned: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-indigo-100 text-indigo-700',
  submitted: 'bg-purple-100 text-purple-700',
  changes_requested: 'bg-amber-100 text-amber-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  denied: 'bg-red-100 text-red-700',
  blocked: 'bg-orange-100 text-orange-700',
  escalated: 'bg-rose-100 text-rose-700',
  closed: 'bg-slate-200 text-slate-500',
};

const taskTypeLabels: Record<TaskType, string> = {
  request_project_narrative: 'Project Narrative',
  request_process_of_experimentation_details: 'Experimentation Details',
  request_uncertainty_statement: 'Uncertainty Statement',
  request_technical_document_upload: 'Technical Document',
  request_test_results_upload: 'Test Results',
  resolve_financial_anomaly: 'Financial Anomaly',
  verify_employee_allocation: 'Employee Allocation',
  verify_contractor_qualification: 'Contractor Qualification',
  confirm_supply_eligibility: 'Supply Eligibility',
  review_ai_evaluation: 'AI Evaluation Review',
  final_review_and_signoff: 'Final Review',
  generic: 'General Task',
};

interface TaskBoardProps {
  clientId?: string;
  view: 'my' | 'client' | 'review' | 'blockers';
  onTaskSelect?: (task: StructuredTask) => void;
}

export const TaskBoard: React.FC<TaskBoardProps> = ({ clientId, view, onTaskSelect }) => {
  const queryClient = useQueryClient();
  const [selectedTask, setSelectedTask] = useState<StructuredTask | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterPriority, setFilterPriority] = useState<string>('');

  // Queries
  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks', view, clientId, filterStatus],
    queryFn: () => {
      if (view === 'my') return getMyTasks(filterStatus || undefined);
      if (view === 'client' && clientId) return getClientTasks(clientId, filterStatus || undefined);
      if (view === 'review') return getReviewQueue();
      if (view === 'blockers') return getBlockerTasks();
      return Promise.resolve([]);
    },
  });

  // Mutations
  const statusMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) => updateTaskStatus(taskId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const escalateMutation = useMutation({
    mutationFn: (taskId: string) => escalateTask(taskId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const filteredTasks = tasks?.filter(task => {
    if (filterPriority && task.priority !== filterPriority) return false;
    return true;
  }) || [];

  const handleStartTask = (task: StructuredTask) => {
    statusMutation.mutate({ taskId: task.id, status: 'in_progress' });
  };

  const handleEscalate = (task: StructuredTask) => {
    escalateMutation.mutate(task.id);
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 bg-muted rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="input text-sm py-2 px-3 w-40"
        >
          <option value="">All Statuses</option>
          <option value="assigned">Assigned</option>
          <option value="in_progress">In Progress</option>
          <option value="submitted">Submitted</option>
          <option value="changes_requested">Changes Requested</option>
          <option value="blocked">Blocked</option>
          <option value="escalated">Escalated</option>
        </select>

        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="input text-sm py-2 px-3 w-40"
        >
          <option value="">All Priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <span className="text-sm text-muted-foreground ml-auto">
          {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Task List */}
      {filteredTasks.length === 0 ? (
        <div className="text-center py-16 bg-muted/30 rounded-2xl border border-dashed border-border">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/10 flex items-center justify-center text-accent">
            {Icons.check}
          </div>
          <h3 className="font-semibold text-foreground mb-1">No Tasks</h3>
          <p className="text-sm text-muted-foreground">
            {view === 'my' ? "You're all caught up!" : "No tasks match the current filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onSelect={() => {
                setSelectedTask(task);
                onTaskSelect?.(task);
              }}
              onStart={() => handleStartTask(task)}
              onEscalate={() => handleEscalate(task)}
            />
          ))}
        </div>
      )}

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onStatusChange={(status) => statusMutation.mutate({ taskId: selectedTask.id, status })}
        />
      )}
    </div>
  );
};

interface TaskCardProps {
  task: StructuredTask;
  onSelect: () => void;
  onStart: () => void;
  onEscalate: () => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onSelect, onStart, onEscalate }) => {
  const isOverdue = task.due_date && new Date(task.due_date) < new Date();

  return (
    <div
      className="p-4 bg-card border border-border rounded-xl hover:shadow-md transition-all cursor-pointer group"
      onClick={onSelect}
    >
      <div className="flex items-start gap-4">
        {/* Priority Indicator */}
        <div className={`w-1 h-full min-h-[60px] rounded-full ${
          task.priority === 'urgent' ? 'bg-red-500' :
          task.priority === 'high' ? 'bg-amber-500' :
          task.priority === 'medium' ? 'bg-blue-500' : 'bg-slate-300'
        }`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <h4 className="font-semibold text-foreground group-hover:text-accent transition-colors line-clamp-1">
                {task.title}
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {taskTypeLabels[task.task_type]}
                {task.criterion_key && ` • ${task.criterion_key.replace(/_/g, ' ')}`}
              </p>
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              {task.initiated_by_ai && (
                <span className="text-accent" title="AI-generated">
                  {Icons.sparkles}
                </span>
              )}
              <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${statusColors[task.status]}`}>
                {task.status.replace('_', ' ')}
              </span>
            </div>
          </div>

          {task.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
              {task.description}
            </p>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {task.due_date && (
                <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-500 font-medium' : ''}`}>
                  {Icons.clock}
                  {new Date(task.due_date).toLocaleDateString()}
                  {isOverdue && ' (Overdue)'}
                </span>
              )}
              <span className={`px-2 py-0.5 rounded border ${priorityColors[task.priority]}`}>
                {task.priority}
              </span>
            </div>

            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              {task.status === 'assigned' && (
                <button
                  onClick={(e) => { e.stopPropagation(); onStart(); }}
                  className="btn btn-sm btn-primary"
                >
                  Start
                </button>
              )}
              {['in_progress', 'blocked'].includes(task.status) && (
                <button
                  onClick={(e) => { e.stopPropagation(); onEscalate(); }}
                  className="btn btn-sm btn-outline flex items-center gap-1"
                >
                  {Icons.arrowUp} Escalate
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface TaskDetailModalProps {
  task: StructuredTask;
  onClose: () => void;
  onStatusChange: (status: TaskStatus) => void;
}

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ task, onClose, onStatusChange }) => {
  const [reviewDecision, setReviewDecision] = useState<string>('');
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const queryClient = useQueryClient();

  const reviewMutation = useMutation({
    mutationFn: () => reviewTask(task.id, reviewDecision, 'manual_review', reviewNotes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-start justify-between">
            <div>
              <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase rounded-full mb-2 ${statusColors[task.status]}`}>
                {task.status.replace('_', ' ')}
              </span>
              <h2 className="text-xl font-bold text-foreground">{task.title}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {taskTypeLabels[task.task_type]}
                {task.criterion_key && ` • ${task.criterion_key.replace(/_/g, ' ')}`}
              </p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {task.description && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Description</h3>
              <p className="text-foreground">{task.description}</p>
            </div>
          )}

          {/* Acceptance Criteria */}
          {task.acceptance_criteria && task.acceptance_criteria.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Acceptance Criteria</h3>
              <ul className="space-y-2">
                {task.acceptance_criteria.map((criteria: any, i: number) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center ${criteria.met ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                      {Icons.check}
                    </span>
                    {criteria.label}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Review Section (for submitted tasks) */}
          {task.status === 'submitted' && (
            <div className="bg-accent/5 p-4 rounded-xl border border-accent/20">
              <h3 className="text-sm font-semibold text-foreground mb-3">Review This Task</h3>
              <div className="space-y-3">
                <div className="flex gap-2">
                  {['accepted', 'changes_requested', 'denied'].map((decision) => (
                    <button
                      key={decision}
                      onClick={() => setReviewDecision(decision)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        reviewDecision === decision
                          ? decision === 'accepted' ? 'bg-emerald-500 text-white' :
                            decision === 'denied' ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {decision === 'accepted' ? 'Accept' : decision === 'denied' ? 'Deny' : 'Request Changes'}
                    </button>
                  ))}
                </div>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Add review notes..."
                  className="input w-full min-h-[80px]"
                />
                <button
                  onClick={() => reviewMutation.mutate()}
                  disabled={!reviewDecision || reviewMutation.isPending}
                  className="btn btn-primary w-full"
                >
                  {reviewMutation.isPending ? 'Submitting...' : 'Submit Review'}
                </button>
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
            <div>
              <p className="text-xs text-muted-foreground">Priority</p>
              <p className={`text-sm font-medium px-2 py-0.5 rounded inline-block mt-1 ${priorityColors[task.priority]}`}>
                {task.priority}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Due Date</p>
              <p className="text-sm font-medium text-foreground mt-1">
                {task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No due date'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Created</p>
              <p className="text-sm text-foreground mt-1">
                {new Date(task.created_at).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">AI Generated</p>
              <p className="text-sm text-foreground mt-1">
                {task.initiated_by_ai ? 'Yes' : 'No'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskBoard;




