"use client";

import React, { useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getOrgSettings, updateOrgSettings, type OrgSettings } from '@/lib/admin';

export default function SettingsPage() {
  const { profile, organization } = useAuth();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState<'profile' | 'organization' | 'preferences'>('profile');
  const [editingSettings, setEditingSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState<Partial<OrgSettings['defaults']>>({});
  
  // Fetch org settings
  const { data: orgSettings, isLoading } = useQuery({
    queryKey: ['org-settings'],
    queryFn: () => getOrgSettings(),
    enabled: !!organization?.id,
  });
  
  // Update settings mutation
  const updateMutation = useMutation({
    mutationFn: (data: { defaults?: Partial<OrgSettings['defaults']> }) => updateOrgSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-settings'] });
      setEditingSettings(false);
    },
  });
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
        <p className="text-gray-400">Manage your account and organization settings</p>
      </div>
      
      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10 pb-2">
        {(['profile', 'organization', 'preferences'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-t-lg font-medium transition-colors capitalize ${
              activeTab === tab
                ? 'bg-blue-500/20 text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      
      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          <div className="bg-[#12121a] border border-white/10 rounded-xl p-6">
            <h3 className="font-semibold text-white mb-4">Profile Information</h3>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Full Name</label>
                <p className="text-white">{profile?.full_name || 'Not set'}</p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Email</label>
                <p className="text-white">{profile?.email || 'Not set'}</p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Role</label>
                <p className="text-white capitalize">{profile?.role_level || 'User'}</p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Member Since</label>
                <p className="text-white">
                  {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : 'Unknown'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Organization Tab */}
      {activeTab === 'organization' && (
        <div className="space-y-6">
          <div className="bg-[#12121a] border border-white/10 rounded-xl p-6">
            <h3 className="font-semibold text-white mb-4">Organization Details</h3>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Organization Name</label>
                <p className="text-white">{organization?.name || 'Not set'}</p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Industry</label>
                <p className="text-white">{organization?.industry || 'Not set'}</p>
              </div>
            </div>
          </div>
          
          {orgSettings && (
            <div className="bg-[#12121a] border border-white/10 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white">Default Thresholds</h3>
                <button
                  onClick={() => {
                    setSettingsForm(orgSettings.defaults || {});
                    setEditingSettings(true);
                  }}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  Edit
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-400">Wage Outlier Threshold</p>
                  <p className="text-white font-medium">
                    ${(orgSettings.defaults?.wage_outlier_threshold || 500000).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Large Transaction Threshold</p>
                  <p className="text-white font-medium">
                    ${(orgSettings.defaults?.large_tx_threshold || 50000).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Senior Required Credit at Risk</p>
                  <p className="text-white font-medium">
                    ${(orgSettings.defaults?.senior_required_credit_at_risk || 25000).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Senior Required QRE at Risk</p>
                  <p className="text-white font-medium">
                    ${(orgSettings.defaults?.senior_required_qre_at_risk || 100000).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {orgSettings && (
            <div className="bg-[#12121a] border border-white/10 rounded-xl p-6">
              <h3 className="font-semibold text-white mb-4">Feature Flags</h3>
              <div className="space-y-3">
                {Object.entries(orgSettings.feature_flags || {}).map(([flag, enabled]) => (
                  <div key={flag} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                    <span className="text-white capitalize">{flag.replace(/_/g, ' ')}</span>
                    <span className={`px-2 py-1 rounded text-xs ${
                      enabled ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-gray-400'
                    }`}>
                      {enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Preferences Tab */}
      {activeTab === 'preferences' && (
        <div className="space-y-6">
          <div className="bg-[#12121a] border border-white/10 rounded-xl p-6">
            <h3 className="font-semibold text-white mb-4">Display Preferences</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white">Dark Mode</p>
                  <p className="text-sm text-gray-400">Always enabled in Testscape</p>
                </div>
                <div className="px-3 py-1 bg-green-500/20 text-green-400 text-sm rounded">
                  Active
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white">Compact Tables</p>
                  <p className="text-sm text-gray-400">Show more rows per page</p>
                </div>
                <div className="px-3 py-1 bg-white/10 text-gray-400 text-sm rounded">
                  Off
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-[#12121a] border border-white/10 rounded-xl p-6">
            <h3 className="font-semibold text-white mb-4">Notifications</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white">Email Notifications</p>
                  <p className="text-sm text-gray-400">Receive updates via email</p>
                </div>
                <div className="px-3 py-1 bg-green-500/20 text-green-400 text-sm rounded">
                  Enabled
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white">Escalation Alerts</p>
                  <p className="text-sm text-gray-400">Get notified of new escalations</p>
                </div>
                <div className="px-3 py-1 bg-green-500/20 text-green-400 text-sm rounded">
                  Enabled
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Edit Settings Modal */}
      {editingSettings && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#1a1a22] border border-white/10 rounded-2xl p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold text-white mb-4">Edit Thresholds</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              updateMutation.mutate({ defaults: settingsForm });
            }} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Wage Outlier ($)</label>
                  <input
                    type="number"
                    value={settingsForm.wage_outlier_threshold || 500000}
                    onChange={(e) => setSettingsForm(prev => ({ ...prev, wage_outlier_threshold: parseInt(e.target.value) }))}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Large Transaction ($)</label>
                  <input
                    type="number"
                    value={settingsForm.large_tx_threshold || 50000}
                    onChange={(e) => setSettingsForm(prev => ({ ...prev, large_tx_threshold: parseInt(e.target.value) }))}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Senior Credit Risk ($)</label>
                  <input
                    type="number"
                    value={settingsForm.senior_required_credit_at_risk || 25000}
                    onChange={(e) => setSettingsForm(prev => ({ ...prev, senior_required_credit_at_risk: parseInt(e.target.value) }))}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Senior QRE Risk ($)</label>
                  <input
                    type="number"
                    value={settingsForm.senior_required_qre_at_risk || 100000}
                    onChange={(e) => setSettingsForm(prev => ({ ...prev, senior_required_qre_at_risk: parseInt(e.target.value) }))}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingSettings(false)}
                  className="flex-1 py-2 bg-white/5 text-white rounded-lg hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="flex-1 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
