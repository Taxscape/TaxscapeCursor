"use client";

import React, { useState } from 'react';
import { useActiveContext } from '@/context/workspace-context';
import { useTasks } from '@/lib/queries';

type TaskTab = 'my_tasks' | 'client_tasks' | 'review_queue' | 'blockers';

export default function TasksPage() {
  const { orgId, clientId } = useActiveContext();
  const { data: tasks = [], isLoading } = useTasks(orgId, clientId);
  const [activeTab, setActiveTab] = useState<TaskTab>('my_tasks');
  
  if (!orgId) {
    return <EmptyState title="No Organization" description="You need to be part of an organization to view tasks." />;
  }
  
  const pendingTasks = tasks.filter((t: any) => t.status === 'pending');
  const completedTasks = tasks.filter((t: any) => t.status === 'completed');
  const blockerTasks = tasks.filter((t: any) => t.is_blocker);
  
  const filteredTasks = activeTab === 'blockers' 
    ? blockerTasks 
    : activeTab === 'review_queue'
    ? tasks.filter((t: any) => t.task_type === 'review')
    : tasks;
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tasks & Verification</h1>
          <p className="text-muted-foreground">
            {pendingTasks.length} pending • {completedTasks.length} completed
          </p>
        </div>
        <button className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:opacity-90 font-medium">
          + New Task
        </button>
      </div>
      
      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        {[
          { id: 'my_tasks', label: 'My Tasks' },
          { id: 'client_tasks', label: 'Client Tasks' },
          { id: 'review_queue', label: 'Review Queue' },
          { id: 'blockers', label: 'Blockers', count: blockerTasks.length },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TaskTab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-destructive text-destructive-foreground">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>
      
      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredTasks.length === 0 ? (
        <EmptyState
          title="No Tasks"
          description="Create tasks to track verification items, documentation needs, and follow-ups."
        />
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Task</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Type</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Entity</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Due</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((task: any) => (
                <tr key={task.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{task.description}</p>
                    {task.notes && (
                      <p className="text-sm text-muted-foreground truncate max-w-md">{task.notes}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 text-xs rounded-full bg-muted text-muted-foreground">
                      {task.task_type || 'general'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">
                    {task.entity_type || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      task.status === 'completed' ? 'bg-green-100 text-green-700' :
                      task.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {task.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
        <TasksIcon />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}

function TasksIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

