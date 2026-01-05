import React, { createContext, useContext, useEffect, useCallback } from 'react';
import { queryClient, CACHE_KEYS } from './query-client';
import { getSupabaseClient } from '@/lib/supabase';
import { inlineEditEntity } from '@/lib/api';
import { toast } from 'react-hot-toast';

interface DataWorkspaceContextType {
  performEdit: (table: string, id: string, field: string, value: any, version: number) => Promise<void>;
}

const DataWorkspaceContext = createContext<DataWorkspaceContextType | null>(null);

export const DataWorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const supabase = getSupabaseClient();

  // Optimized mutation helper with optimistic updates
  const performEdit = useCallback(async (table: string, id: string, field: string, value: any, version: number) => {
    // 1. Optimistic Update
    const previousData = queryClient.getQueryData(CACHE_KEYS.project(id));
    if (previousData) {
      queryClient.setQueryData(CACHE_KEYS.project(id), (old: any) => ({ ...old, [field]: value }));
    }

    try {
      await inlineEditEntity(table, id, { [field]: value, version });
      toast.success(`${field.replace('_', ' ')} updated`);
    } catch (error: any) {
      // 2. Rollback on failure
      if (previousData) {
        queryClient.setQueryData(CACHE_KEYS.project(id), previousData);
      }
      
      if (error.message === 'CONFLICT') {
        toast.error('Version conflict: Someone else updated this record. Reloading...');
        queryClient.invalidateQueries({ queryKey: CACHE_KEYS.project(id) });
      } else {
        toast.error(`Update failed: ${error.message}`);
      }
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;

    // Supabase Realtime Subscription for reactive updates
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        (payload: { table: string; eventType: string; new: any; old: any }) => {
          console.log('[Realtime] Change detected:', payload);
          const { table, eventType, new: newRecord, old: oldRecord } = payload;

          // Deterministic Invalidation Strategy
          invalidateCache(table, newRecord, oldRecord);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const invalidateCache = (table: string, newRecord: any, _oldRecord: any) => {
    // 1. Invalidate list views
    if (table === 'projects') {
      queryClient.invalidateQueries({ queryKey: ['projects', 'list'] });
      if (newRecord?.id) queryClient.invalidateQueries({ queryKey: CACHE_KEYS.project(newRecord.id) });
    } else if (table === 'employees') {
      queryClient.invalidateQueries({ queryKey: ['employees', 'list'] });
      // Cross-entity: update project allocations if employee changes
      queryClient.invalidateQueries({ queryKey: ['projects', 'list'] });
    } else if (table === 'contractors') {
      queryClient.invalidateQueries({ queryKey: ['contractors', 'list'] });
    } else if (table === 'expenses') {
      queryClient.invalidateQueries({ queryKey: ['expenses', 'list'] });
    } else if (table === 'project_workflow_status') {
      if (newRecord?.project_id) queryClient.invalidateQueries({ queryKey: ['workflow', newRecord.project_id] });
    }

    // 2. Global KPIs often depend on everything
    if (['projects', 'employees', 'contractors', 'expenses'].includes(table)) {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }
  };

  return (
    <DataWorkspaceContext.Provider value={{ performEdit }}>
      {children}
    </DataWorkspaceContext.Provider>
  );
};

export const useDataWorkspace = () => useContext(DataWorkspaceContext);

