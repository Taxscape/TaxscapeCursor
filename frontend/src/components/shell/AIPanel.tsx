"use client";

import React from 'react';
import { useWorkspace } from '@/context/workspace-context';
import { CopilotPanel } from '@/components/copilot/CopilotPanel';

export function AIPanel() {
  const { state, setAIPanel } = useWorkspace();
  
  return (
    <aside className="w-96 border-l border-border bg-card flex flex-col">
      <CopilotPanel
        isOpen={true}
        onClose={() => setAIPanel(false)}
        clientId={state.clientId || ''}
        projectId={state.selectedProjectId || undefined}
      />
    </aside>
  );
}



