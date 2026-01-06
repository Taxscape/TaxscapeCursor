"use client";

import React from 'react';
import { useAuth } from '@/context/auth-context';

export default function SettingsPage() {
  const { user, profile, organization } = useAuth();
  
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground">Manage your account and workspace preferences</p>
      </div>
      
      {/* Profile Section */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="font-semibold text-foreground mb-4">Profile</h3>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xl font-bold">
              {profile?.full_name?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <p className="font-semibold text-foreground">{profile?.full_name || 'User'}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Full Name</label>
              <input
                type="text"
                defaultValue={profile?.full_name || ''}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground"
                disabled
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Email</label>
              <input
                type="email"
                defaultValue={user?.email || ''}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground"
                disabled
              />
            </div>
          </div>
        </div>
      </div>
      
      {/* Organization Section */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="font-semibold text-foreground mb-4">Organization</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Organization Name</label>
            <input
              type="text"
              defaultValue={organization?.name || 'No organization'}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground"
              disabled
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Organization ID</label>
            <input
              type="text"
              defaultValue={organization?.id || '-'}
              className="w-full px-3 py-2 rounded-lg border border-border bg-muted text-muted-foreground font-mono text-sm"
              disabled
            />
          </div>
        </div>
      </div>
      
      {/* Preferences Section */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="font-semibold text-foreground mb-4">Preferences</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Dark Mode</p>
              <p className="text-sm text-muted-foreground">Use dark theme throughout the app</p>
            </div>
            <button className="w-12 h-6 rounded-full bg-accent relative">
              <span className="absolute right-1 top-1 w-4 h-4 rounded-full bg-white" />
            </button>
          </div>
          
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div>
              <p className="font-medium text-foreground">Email Notifications</p>
              <p className="text-sm text-muted-foreground">Receive email updates about tasks and deadlines</p>
            </div>
            <button className="w-12 h-6 rounded-full bg-muted relative">
              <span className="absolute left-1 top-1 w-4 h-4 rounded-full bg-white" />
            </button>
          </div>
        </div>
      </div>
      
      {/* Danger Zone */}
      <div className="bg-card rounded-xl border border-destructive/20 p-6">
        <h3 className="font-semibold text-destructive mb-4">Danger Zone</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-foreground">Delete Account</p>
            <p className="text-sm text-muted-foreground">Permanently delete your account and all data</p>
          </div>
          <button className="px-4 py-2 rounded-lg border border-destructive text-destructive hover:bg-destructive/10 transition-colors">
            Delete Account
          </button>
        </div>
      </div>
    </div>
  );
}

