"use client";

import React, { useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  listAuthorityRefs, 
  createAuthorityRef, 
  getOrgSettings, 
  updateOrgSettings,
  listAuditExports,
  exportAuditLogs,
  exportDefensePack,
  type AuthorityRef,
  type OrgSettings,
  type AuditExport 
} from '@/lib/admin';
import { getMyClients, type ClientCompany } from '@/lib/api';

export default function AdminPage() {
  const { isExecutive, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState<'authority' | 'settings' | 'exports'>('authority');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateAuthority, setShowCreateAuthority] = useState(false);
  const [newAuthority, setNewAuthority] = useState({
    authority_type: 'irc' as const,
    citation_label: '',
    citation_key: '',
    summary: '',
    excerpt: '',
    tags: '',
    url: '',
  });
  
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear() - 1);
  
  // Fetch authorities
  const { data: authoritiesData, isLoading: authLoading, refetch: refetchAuthorities } = useQuery({
    queryKey: ['authorities', searchQuery],
    queryFn: () => listAuthorityRefs({ activeOnly: true }),
  });
  
  // Fetch org settings
  const { data: orgSettings, isLoading: settingsLoading } = useQuery({
    queryKey: ['org-settings'],
    queryFn: () => getOrgSettings(),
  });
  
  // Fetch clients
  const { data: clientsData } = useQuery({
    queryKey: ['my-clients'],
    queryFn: () => getMyClients(),
  });
  
  // Fetch exports
  const { data: exportsData, refetch: refetchExports } = useQuery({
    queryKey: ['audit-exports', selectedClient],
    queryFn: () => listAuditExports(selectedClient || undefined),
    enabled: activeTab === 'exports',
  });
  
  const authorities = authoritiesData || [];
  const clients = clientsData?.clients || [];
  const exports = exportsData || [];
  
  // Create authority mutation
  const createAuthorityMutation = useMutation({
    mutationFn: () => createAuthorityRef({
      ...newAuthority,
      tags: newAuthority.tags.split(',').map(t => t.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      refetchAuthorities();
      setShowCreateAuthority(false);
      setNewAuthority({
        authority_type: 'irc',
        citation_label: '',
        citation_key: '',
        summary: '',
        excerpt: '',
        tags: '',
        url: '',
      });
    },
  });
  
  // Export mutations
  const exportLogsMutation = useMutation({
    mutationFn: () => exportAuditLogs(selectedClient, selectedYear),
    onSuccess: () => refetchExports(),
  });
  
  const exportDefenseMutation = useMutation({
    mutationFn: () => exportDefensePack(selectedClient, selectedYear),
    onSuccess: () => refetchExports(),
  });
  
  // TEMPORARY: Allow all users to access admin during development
  const canAccessAdmin = true; // Was: isExecutive || isAdmin
  
  if (!canAccessAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center mb-4">
          <ShieldIcon className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
        <p className="text-gray-400">You need executive or admin permissions to access this page.</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Admin Panel</h1>
        <p className="text-gray-400">Manage authority library, settings, and audit exports</p>
      </div>
      
      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10 pb-2">
        {[
          { id: 'authority', label: 'Authority Library' },
          { id: 'settings', label: 'Firm Settings' },
          { id: 'exports', label: 'Audit Exports' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-500/20 text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      
      {/* Authority Library Tab */}
      {activeTab === 'authority' && (
        <div className="space-y-4">
          <div className="flex gap-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search authorities..."
              className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
            />
            <button
              onClick={() => setShowCreateAuthority(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Add Authority
            </button>
          </div>
          
          <div className="bg-[#12121a] border border-white/10 rounded-xl overflow-hidden">
            {authLoading ? (
              <div className="p-8 text-center text-gray-400">Loading...</div>
            ) : authorities.length === 0 ? (
              <div className="p-8 text-center text-gray-400">No authorities found</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Citation</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Type</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Summary</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Tags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {authorities.filter((a: AuthorityRef) => 
                    !searchQuery || 
                    a.citation_label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    a.citation_key.toLowerCase().includes(searchQuery.toLowerCase())
                  ).map((auth: AuthorityRef) => (
                    <tr key={auth.id} className="hover:bg-white/5">
                      <td className="py-3 px-4">
                        <p className="text-white font-medium">{auth.citation_label}</p>
                        <p className="text-xs text-gray-500">{auth.citation_key}</p>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-1 bg-white/10 text-gray-400 text-xs rounded">
                          {auth.authority_type}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm text-gray-400 truncate max-w-xs">{auth.summary}</p>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {auth.tags?.slice(0, 3).map((tag: string) => (
                            <span key={tag} className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
      
      {/* Firm Settings Tab */}
      {activeTab === 'settings' && orgSettings && (
        <div className="space-y-6">
          <div className="bg-[#12121a] border border-white/10 rounded-xl p-6">
            <h3 className="font-semibold text-white mb-4">Review Thresholds</h3>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-gray-400 mb-1">Wage Outlier Threshold</p>
                <p className="text-xl font-bold text-white">
                  ${(orgSettings.defaults?.wage_outlier_threshold || 500000).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">Large Transaction Threshold</p>
                <p className="text-xl font-bold text-white">
                  ${(orgSettings.defaults?.large_tx_threshold || 50000).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-[#12121a] border border-white/10 rounded-xl p-6">
            <h3 className="font-semibold text-white mb-4">Senior Gating Thresholds</h3>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-gray-400 mb-1">Credit at Risk Threshold</p>
                <p className="text-xl font-bold text-yellow-400">
                  ${(orgSettings.defaults?.senior_required_credit_at_risk || 25000).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">QRE at Risk Threshold</p>
                <p className="text-xl font-bold text-yellow-400">
                  ${(orgSettings.defaults?.senior_required_qre_at_risk || 100000).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-[#12121a] border border-white/10 rounded-xl p-6">
            <h3 className="font-semibold text-white mb-4">Feature Flags</h3>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(orgSettings.feature_flags || {}).map(([flag, enabled]) => (
                <div key={flag} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <span className="text-white text-sm capitalize">{flag.replace(/_/g, ' ')}</span>
                  <span className={`px-2 py-1 rounded text-xs ${
                    enabled ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-gray-400'
                  }`}>
                    {enabled ? 'ON' : 'OFF'}
                  </span>
                </div>
              ))}
            </div>
          </div>
          
          <div className="bg-[#12121a] border border-white/10 rounded-xl p-6">
            <h3 className="font-semibold text-white mb-4">Purchased Sections</h3>
            <div className="flex gap-3">
              {(orgSettings.purchased_sections || ['41']).map((section: string) => (
                <span key={section} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg font-medium">
                  Section {section}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* Audit Exports Tab */}
      {activeTab === 'exports' && (
        <div className="space-y-6">
          <div className="bg-[#12121a] border border-white/10 rounded-xl p-6">
            <h3 className="font-semibold text-white mb-4">Generate Export</h3>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Client</label>
                <select
                  value={selectedClient}
                  onChange={(e) => setSelectedClient(e.target.value)}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                >
                  <option value="">Select client...</option>
                  {clients.map((client: ClientCompany) => (
                    <option key={client.id} value={client.id}>{client.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Tax Year</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                >
                  {[2024, 2023, 2022, 2021].map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => exportLogsMutation.mutate()}
                disabled={!selectedClient || exportLogsMutation.isPending}
                className="px-4 py-2 bg-white/5 text-white rounded-lg hover:bg-white/10 disabled:opacity-50"
              >
                Export Audit Logs (CSV)
              </button>
              <button
                onClick={() => exportDefenseMutation.mutate()}
                disabled={!selectedClient || exportDefenseMutation.isPending}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                Export Defense Pack (ZIP)
              </button>
            </div>
          </div>
          
          <div className="bg-[#12121a] border border-white/10 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 bg-white/5">
              <p className="font-semibold text-white">Export History</p>
            </div>
            {exports.length === 0 ? (
              <div className="p-8 text-center text-gray-400">No exports yet</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Type</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Client</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Year</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Created</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {exports.map((exp: AuditExport) => (
                    <tr key={exp.id} className="hover:bg-white/5">
                      <td className="py-3 px-4">
                        <span className="text-white">{exp.export_type.replace(/_/g, ' ')}</span>
                      </td>
                      <td className="py-3 px-4 text-gray-400">{exp.client_company_id}</td>
                      <td className="py-3 px-4 text-gray-400">{exp.tax_year}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-xs ${
                          exp.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                          exp.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {exp.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-400 text-sm">
                        {new Date(exp.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {exp.status === 'completed' && exp.download_url && (
                          <a
                            href={exp.download_url}
                            className="text-blue-400 hover:text-blue-300 text-sm"
                          >
                            Download
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
      
      {/* Create Authority Modal */}
      {showCreateAuthority && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#1a1a22] border border-white/10 rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-white mb-4">Add Authority Reference</h3>
            <form onSubmit={(e) => { e.preventDefault(); createAuthorityMutation.mutate(); }} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Type</label>
                  <select
                    value={newAuthority.authority_type}
                    onChange={(e) => setNewAuthority(prev => ({ ...prev, authority_type: e.target.value as any }))}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                  >
                    <option value="irc">IRC</option>
                    <option value="treasury_reg">Treasury Reg</option>
                    <option value="court_case">Court Case</option>
                    <option value="irs_guidance">IRS Guidance</option>
                    <option value="rev_proc">Rev Proc</option>
                    <option value="rev_rul">Rev Rul</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Citation Key *</label>
                  <input
                    type="text"
                    value={newAuthority.citation_key}
                    onChange={(e) => setNewAuthority(prev => ({ ...prev, citation_key: e.target.value }))}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                    placeholder="e.g., IRC-41"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Citation Label *</label>
                <input
                  type="text"
                  value={newAuthority.citation_label}
                  onChange={(e) => setNewAuthority(prev => ({ ...prev, citation_label: e.target.value }))}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                  placeholder="e.g., IRC §41 - R&D Tax Credit"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Summary *</label>
                <textarea
                  value={newAuthority.summary}
                  onChange={(e) => setNewAuthority(prev => ({ ...prev, summary: e.target.value }))}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white h-20"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Excerpt</label>
                <textarea
                  value={newAuthority.excerpt}
                  onChange={(e) => setNewAuthority(prev => ({ ...prev, excerpt: e.target.value }))}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white h-24"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Tags (comma-separated)</label>
                  <input
                    type="text"
                    value={newAuthority.tags}
                    onChange={(e) => setNewAuthority(prev => ({ ...prev, tags: e.target.value }))}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                    placeholder="qre, wages, four-part-test"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">URL</label>
                  <input
                    type="url"
                    value={newAuthority.url}
                    onChange={(e) => setNewAuthority(prev => ({ ...prev, url: e.target.value }))}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateAuthority(false)}
                  className="flex-1 py-2 bg-white/5 text-white rounded-lg hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createAuthorityMutation.isPending}
                  className="flex-1 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                >
                  {createAuthorityMutation.isPending ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Icons
function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
