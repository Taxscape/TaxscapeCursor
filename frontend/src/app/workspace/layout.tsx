"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { WorkspaceProvider } from '@/context/workspace-context';
import { DataWorkspaceProvider } from '@/context/data-workspace-context';
import { AppShell } from '@/components/shell';

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  
  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login?redirect=/workspace');
    }
  }, [user, isLoading, router]);
  
  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Loading workspace...</p>
        </div>
      </div>
    );
  }
  
  // Don't render workspace if not authenticated (will redirect)
  if (!user) {
    return null;
  }
  
  return (
    <WorkspaceProvider>
      <DataWorkspaceProvider>
        <AppShell>
          {children}
        </AppShell>
      </DataWorkspaceProvider>
    </WorkspaceProvider>
  );
}

