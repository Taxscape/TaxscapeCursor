import React from 'react';
import { Project, Employee, Contractor } from '@/lib/schemas';

interface RecordViewProps {
  entity: Project | Employee | Contractor;
  type: 'project' | 'employee' | 'contractor';
  onEdit: (field: string, value: any) => void;
}

export const RecordView: React.FC<RecordViewProps> = ({ entity, type, onEdit }) => {
  return (
    <div className="space-y-8 animate-fade-in max-w-4xl mx-auto py-8">
      <header className="border-b border-border pb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-bold text-foreground tracking-tight">
            {(entity as any).name}
          </h1>
          <div className="flex gap-2">
            <span className="badge badge-outline">v{entity.version}</span>
            <span className="badge badge-success">Saved</span>
          </div>
        </div>
        <p className="text-muted-foreground mt-2 uppercase text-xs font-bold tracking-widest">
          {type} • ID: {entity.id.slice(0, 8)}
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Basic Info Block */}
        <section className="glass-card p-6 space-y-4">
          <h3 className="text-sm font-bold uppercase text-muted-foreground">Information</h3>
          <div className="space-y-4">
            {Object.entries(entity).map(([key, value]) => {
              if (['id', 'version', 'created_at', 'updated_at', 'last_modified_by', 'name'].includes(key)) return null;
              return (
                <div key={key}>
                  <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">{key.replace(/_/g, ' ')}</label>
                  <p className="text-foreground font-medium">{String(value || '—')}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Narrative / Description Block */}
        <section className="glass-card p-6 space-y-4 md:col-span-2">
          <h3 className="text-sm font-bold uppercase text-muted-foreground">Technical Narrative</h3>
          <textarea
            className="w-full h-64 bg-transparent border-none focus:ring-0 text-lg leading-relaxed text-foreground placeholder:text-muted-foreground/30 resize-none"
            placeholder="Start typing the project narrative here..."
            defaultValue={(entity as any).description || ''}
            onBlur={(e) => onEdit('description', e.target.value)}
          />
        </section>
      </div>
    </div>
  );
};

