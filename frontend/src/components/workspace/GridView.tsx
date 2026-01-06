import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';

interface Column<T> {
  key: keyof T | string;
  label: string;
  type: 'text' | 'number' | 'percent' | 'currency' | 'enum' | 'boolean' | 'date';
  options?: string[]; // For enum
  editable?: boolean;
}

interface GridViewProps<T> {
  data: T[];
  columns: Column<T>[];
  onEdit: (id: string, field: string, value: any, version: number) => Promise<any>;
  isLoading?: boolean;
}

export function GridView<T extends { id: string; version: number }>({ 
  data, 
  columns, 
  onEdit,
  isLoading 
}: GridViewProps<T>) {
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);

  const mutation = useMutation({
    mutationFn: ({ id, field, value, version }: { id: string; field: string; value: any; version: number }) => 
      onEdit(id, field, value, version),
    onSuccess: () => {
      // Realtime will handle invalidation, but we can do it here for instant feedback if needed
    },
  });

  const renderCell = (item: T, column: Column<T>) => {
    const isEditing = editingCell?.id === item.id && editingCell?.field === column.key;
    const value = (item as any)[column.key];

    if (column.editable && isEditing) {
      return (
        <input
          autoFocus
          className="w-full px-2 py-1 bg-white border border-accent rounded shadow-sm focus:outline-none ring-2 ring-accent/20"
          defaultValue={value}
          onBlur={(e) => {
            const newValue = e.target.value;
            if (newValue !== String(value)) {
              mutation.mutate({ id: item.id, field: column.key as string, value: newValue, version: item.version });
            }
            setEditingCell(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setEditingCell(null);
          }}
        />
      );
    }

    return (
      <div 
        className={`px-2 py-1 h-8 flex items-center truncate ${column.editable ? 'cursor-pointer hover:bg-accent/5' : ''}`}
        onClick={() => column.editable && setEditingCell({ id: item.id, field: column.key as string })}
      >
        {formatValue(value, column.type)}
      </div>
    );
  };

  const formatValue = (value: any, type: Column<T>['type']) => {
    if (value === null || value === undefined) return '';
    switch (type) {
      case 'currency': return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
      case 'percent': return `${value}%`;
      case 'boolean': return value ? '✅' : '❌';
      default: return String(value);
    }
  };

  if (isLoading) return <div className="animate-pulse space-y-4">{/* Skeleton lines */}</div>;

  return (
    <div className="overflow-x-auto border border-border rounded-xl bg-card">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-muted/50 border-b border-border">
            {columns.map((col) => (
              <th key={col.key as string} className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.id} className="border-b border-border hover:bg-muted/30 transition-colors">
              {columns.map((col) => (
                <td key={col.key as string} className="p-1">
                  {renderCell(item, col)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}



