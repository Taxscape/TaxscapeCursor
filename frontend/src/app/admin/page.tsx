"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import {
  listAuthorityRefs,
  createAuthorityRef,
  updateAuthorityRef,
  deactivateAuthorityRef,
  reactivateAuthorityRef,
  getOrgSettings,
  updateOrgSettings,
  listAuditExports,
  exportAuditLogs,
  exportDefensePack,
  AuthorityRef,
  AuthorityCreate,
  AuthorityUpdate,
  OrgSettings,
  OrgSettingsUpdate,
  AuditExport,
  AUTHORITY_TYPES,
  COMMON_TAGS,
  formatCurrency,
  formatPercent,
} from "@/lib/admin";
import { getMyClients } from "@/lib/api";

type TabType = "authority" | "settings" | "exports" | "legacy";

export default function AdminPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, profile, isLoading: authLoading, isExecutive, isAdmin } = useAuth();
  
  const [activeTab, setActiveTab] = useState<TabType>("authority");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Check if user is executive or admin (using auth context values)
  const canAccessAdmin = isExecutive || isAdmin;

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-gray-500">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (!canAccessAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Restricted</h1>
          <p className="text-gray-500 mb-6">
            Admin controls are only available to executives and administrators.
          </p>
          <button
            onClick={() => router.push("/portal")}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go to Portal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/portal")}
              className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition"
            >
              ← Back to Portal
            </button>
            <div className="h-6 w-px bg-gray-200" />
            <h1 className="text-lg font-semibold">Admin Controls</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">{user?.email}</span>
            <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full">
              {isAdmin ? "Admin" : isExecutive ? "Executive" : "User"}
            </span>
          </div>
        </div>
      </header>

      {/* Messages */}
      {error && (
        <div className="max-w-7xl mx-auto px-6 pt-4">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between items-center">
            {error}
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">×</button>
          </div>
        </div>
      )}
      {successMessage && (
        <div className="max-w-7xl mx-auto px-6 pt-4">
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex justify-between items-center">
            {successMessage}
            <button onClick={() => setSuccessMessage(null)} className="text-green-500 hover:text-green-700">×</button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
          {[
            { key: "authority", label: "Authority Library" },
            { key: "settings", label: "Firm Settings" },
            { key: "exports", label: "Audit Exports" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as TabType)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition ${
                activeTab === tab.key
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "authority" && (
          <AuthorityLibraryTab setError={setError} setSuccess={setSuccessMessage} />
        )}
        {activeTab === "settings" && (
          <FirmSettingsTab setError={setError} setSuccess={setSuccessMessage} />
        )}
        {activeTab === "exports" && (
          <AuditExportsTab setError={setError} setSuccess={setSuccessMessage} />
        )}
      </main>
    </div>
  );
}

// =============================================================================
// AUTHORITY LIBRARY TAB
// =============================================================================

function AuthorityLibraryTab({
  setError,
  setSuccess,
}: {
  setError: (msg: string | null) => void;
  setSuccess: (msg: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [editingRef, setEditingRef] = useState<AuthorityRef | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const { data: refs, isLoading } = useQuery({
    queryKey: ["authorityRefs", !showInactive, selectedTag, search],
    queryFn: () => listAuthorityRefs({ activeOnly: !showInactive, tag: selectedTag || undefined, search: search || undefined }),
  });

  const createMutation = useMutation({
    mutationFn: createAuthorityRef,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["authorityRefs"] });
      setCreateModalOpen(false);
      setSuccess("Authority reference created");
    },
    onError: (err: Error) => setError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: AuthorityUpdate }) => updateAuthorityRef(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["authorityRefs"] });
      setEditingRef(null);
      setSuccess("Authority reference updated");
    },
    onError: (err: Error) => setError(err.message),
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateAuthorityRef,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["authorityRefs"] });
      if (result.warning) {
        setError(`Warning: ${result.warning}`);
      } else {
        setSuccess("Authority reference deactivated");
      }
    },
    onError: (err: Error) => setError(err.message),
  });

  const reactivateMutation = useMutation({
    mutationFn: reactivateAuthorityRef,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["authorityRefs"] });
      setSuccess("Authority reference reactivated");
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <input
          type="text"
          placeholder="Search by label, key, or summary..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 border rounded-lg w-64"
        />
        <select
          value={selectedTag || ""}
          onChange={(e) => setSelectedTag(e.target.value || null)}
          className="px-3 py-2 border rounded-lg"
        >
          <option value="">All tags</option>
          {COMMON_TAGS.map((tag) => (
            <option key={tag} value={tag}>{tag}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
        <button
          onClick={() => setCreateModalOpen(true)}
          className="ml-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          + Add Authority
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : refs && refs.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left py-3 px-4 font-medium">Label</th>
                <th className="text-left py-3 px-4 font-medium">Key</th>
                <th className="text-left py-3 px-4 font-medium">Type</th>
                <th className="text-left py-3 px-4 font-medium">Tags</th>
                <th className="text-left py-3 px-4 font-medium">Status</th>
                <th className="text-left py-3 px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {refs.map((ref) => (
                <tr key={ref.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div className="font-medium">{ref.citation_label}</div>
                    <div className="text-xs text-gray-500 line-clamp-1">{ref.summary}</div>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs">{ref.citation_key}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 text-xs bg-gray-100 rounded">
                      {AUTHORITY_TYPES.find((t) => t.value === ref.authority_type)?.label || ref.authority_type}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {(ref.tags || []).slice(0, 3).map((tag) => (
                        <span key={tag} className="px-1.5 py-0.5 text-xs bg-blue-50 text-blue-700 rounded">
                          {tag}
                        </span>
                      ))}
                      {(ref.tags || []).length > 3 && (
                        <span className="text-xs text-gray-400">+{ref.tags.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 text-xs rounded ${
                      ref.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      {ref.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingRef(ref)}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                      {ref.is_active ? (
                        <button
                          onClick={() => {
                            if (confirm("Deactivate this authority reference?")) {
                              deactivateMutation.mutate(ref.id);
                            }
                          }}
                          className="text-sm text-red-600 hover:underline"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          onClick={() => reactivateMutation.mutate(ref.id)}
                          className="text-sm text-green-600 hover:underline"
                        >
                          Reactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-gray-500">No authority references found</div>
        )}
      </div>

      {/* Create Modal */}
      {createModalOpen && (
        <AuthorityModal
          onClose={() => setCreateModalOpen(false)}
          onSubmit={(data) => createMutation.mutate(data as AuthorityCreate)}
          isSubmitting={createMutation.isPending}
        />
      )}

      {/* Edit Modal */}
      {editingRef && (
        <AuthorityModal
          initialData={editingRef}
          onClose={() => setEditingRef(null)}
          onSubmit={(data) => updateMutation.mutate({ id: editingRef.id, data })}
          isSubmitting={updateMutation.isPending}
        />
      )}
    </div>
  );
}

function AuthorityModal({
  initialData,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  initialData?: AuthorityRef;
  onClose: () => void;
  onSubmit: (data: AuthorityCreate | AuthorityUpdate) => void;
  isSubmitting: boolean;
}) {
  const [form, setForm] = useState({
    authority_type: initialData?.authority_type || "irc_section",
    citation_label: initialData?.citation_label || "",
    citation_key: initialData?.citation_key || "",
    summary: initialData?.summary || "",
    excerpt: initialData?.excerpt || "",
    tags: (initialData?.tags || []).join(", "),
    url: initialData?.url || "",
  });

  const isEditing = !!initialData;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
    if (isEditing) {
      onSubmit({
        citation_label: form.citation_label,
        summary: form.summary,
        excerpt: form.excerpt || undefined,
        tags,
        url: form.url || undefined,
      });
    } else {
      onSubmit({
        authority_type: form.authority_type,
        citation_label: form.citation_label,
        citation_key: form.citation_key,
        summary: form.summary,
        excerpt: form.excerpt || undefined,
        tags,
        url: form.url || undefined,
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">
          {isEditing ? "Edit Authority Reference" : "Create Authority Reference"}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isEditing && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select
                  value={form.authority_type}
                  onChange={(e) => setForm({ ...form, authority_type: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                  required
                >
                  {AUTHORITY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Citation Key</label>
                <input
                  type="text"
                  value={form.citation_key}
                  onChange={(e) => setForm({ ...form, citation_key: e.target.value.toUpperCase() })}
                  placeholder="e.g., IRC_41_D"
                  className="w-full p-2 border rounded-lg font-mono"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Unique stable identifier (uppercase)</p>
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Label</label>
            <input
              type="text"
              value={form.citation_label}
              onChange={(e) => setForm({ ...form, citation_label: e.target.value })}
              placeholder="e.g., IRC §41(d) — Qualified Research"
              className="w-full p-2 border rounded-lg"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Summary</label>
            <textarea
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              placeholder="Plain English explanation for junior CPAs..."
              className="w-full p-2 border rounded-lg"
              rows={3}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Excerpt (optional)</label>
            <textarea
              value={form.excerpt}
              onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
              placeholder="Short excerpt from the source..."
              className="w-full p-2 border rounded-lg"
              rows={2}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Tags (comma-separated)</label>
            <input
              type="text"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="qre, wages, four_part_test"
              className="w-full p-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">URL (optional)</label>
            <input
              type="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://..."
              className="w-full p-2 border rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : isEditing ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// FIRM SETTINGS TAB
// =============================================================================

function FirmSettingsTab({
  setError,
  setSuccess,
}: {
  setError: (msg: string | null) => void;
  setSuccess: (msg: string | null) => void;
}) {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["orgSettings"],
    queryFn: getOrgSettings,
  });

  const [form, setForm] = useState<OrgSettingsUpdate>({});

  useEffect(() => {
    if (settings) {
      setForm({
        defaults: { ...settings.defaults },
        feature_flags: { ...settings.feature_flags },
        purchased_sections: [...settings.purchased_sections],
      });
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: updateOrgSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orgSettings"] });
      setSuccess("Settings saved successfully");
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSave = () => {
    updateMutation.mutate(form);
  };

  if (isLoading) {
    return <div className="text-center py-8 text-gray-500">Loading settings...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Review Thresholds */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="text-lg font-semibold mb-4">Review Thresholds</h3>
        <p className="text-sm text-gray-500 mb-4">
          These thresholds control when findings are flagged during review.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-1">Wage Outlier Threshold</label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">$</span>
              <input
                type="number"
                value={form.defaults?.wage_outlier_threshold || 500000}
                onChange={(e) => setForm({
                  ...form,
                  defaults: { ...form.defaults, wage_outlier_threshold: parseFloat(e.target.value) },
                })}
                className="w-full p-2 border rounded-lg"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Wages above this trigger manual verification</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Large Transaction Threshold</label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">$</span>
              <input
                type="number"
                value={form.defaults?.large_tx_threshold || 50000}
                onChange={(e) => setForm({
                  ...form,
                  defaults: { ...form.defaults, large_tx_threshold: parseFloat(e.target.value) },
                })}
                className="w-full p-2 border rounded-lg"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Single expenses above this are flagged</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Allocation Upper Bound</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={form.defaults?.allocation_upper_bound || 0.95}
                onChange={(e) => setForm({
                  ...form,
                  defaults: { ...form.defaults, allocation_upper_bound: parseFloat(e.target.value) },
                })}
                className="w-full p-2 border rounded-lg"
              />
              <span className="text-gray-500">({formatPercent(form.defaults?.allocation_upper_bound || 0.95)})</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Allocations above this are flagged as outliers</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Allocation Lower Bound</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={form.defaults?.allocation_lower_bound || 0.01}
                onChange={(e) => setForm({
                  ...form,
                  defaults: { ...form.defaults, allocation_lower_bound: parseFloat(e.target.value) },
                })}
                className="w-full p-2 border rounded-lg"
              />
              <span className="text-gray-500">({formatPercent(form.defaults?.allocation_lower_bound || 0.01)})</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Allocations below this (non-zero) are flagged</p>
          </div>
        </div>
      </div>

      {/* Senior Gating Thresholds */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="text-lg font-semibold mb-4">Senior Gating Thresholds</h3>
        <p className="text-sm text-gray-500 mb-4">
          Items exceeding these thresholds require senior CPA review before finalization.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-1">Credit at Risk Threshold</label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">$</span>
              <input
                type="number"
                value={form.defaults?.senior_required_credit_at_risk || 25000}
                onChange={(e) => setForm({
                  ...form,
                  defaults: { ...form.defaults, senior_required_credit_at_risk: parseFloat(e.target.value) },
                })}
                className="w-full p-2 border rounded-lg"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Findings with credit impact above this require senior review</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">QRE at Risk Threshold</label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">$</span>
              <input
                type="number"
                value={form.defaults?.senior_required_qre_at_risk || 100000}
                onChange={(e) => setForm({
                  ...form,
                  defaults: { ...form.defaults, senior_required_qre_at_risk: parseFloat(e.target.value) },
                })}
                className="w-full p-2 border rounded-lg"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Findings with QRE impact above this require senior review</p>
          </div>
        </div>
      </div>

      {/* Evidence & Workflow Settings */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="text-lg font-semibold mb-4">Evidence & Workflow Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-1">Evidence Token Expiration (days)</label>
            <input
              type="number"
              value={form.defaults?.evidence_token_expiration_days || 14}
              onChange={(e) => setForm({
                ...form,
                defaults: { ...form.defaults, evidence_token_expiration_days: parseInt(e.target.value) },
              })}
              className="w-full p-2 border rounded-lg"
            />
            <p className="text-xs text-gray-500 mt-1">Client upload links expire after this many days</p>
          </div>
          <div className="space-y-3">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.defaults?.block_finalize_with_open_high_findings ?? true}
                onChange={(e) => setForm({
                  ...form,
                  defaults: { ...form.defaults, block_finalize_with_open_high_findings: e.target.checked },
                })}
                className="w-4 h-4"
              />
              <span className="text-sm">Block finalization with open high-severity findings</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.defaults?.allow_preliminary_credit_export ?? false}
                onChange={(e) => setForm({
                  ...form,
                  defaults: { ...form.defaults, allow_preliminary_credit_export: e.target.checked },
                })}
                className="w-4 h-4"
              />
              <span className="text-sm">Allow preliminary credit exports (before full approval)</span>
            </label>
          </div>
        </div>
      </div>

      {/* Feature Flags */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="text-lg font-semibold mb-4">Feature Flags</h3>
        <p className="text-sm text-gray-500 mb-4">
          Enable or disable platform features for your organization.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { key: "enable_client_upload_portal", label: "Client Upload Portal", desc: "Allow clients to upload files via tokenized links" },
            { key: "enable_section_174_module", label: "Section 174 Module", desc: "Enable Section 174 capitalization tracking" },
            { key: "enable_ai_narratives", label: "AI Narratives", desc: "Generate AI-assisted project narratives" },
            { key: "enable_auto_reprocessing", label: "Auto Reprocessing", desc: "Automatically rerun rules when evidence is uploaded" },
            { key: "enable_study_locking", label: "Study Locking", desc: "Lock canonical data after study completion" },
            { key: "enable_credit_range_module", label: "Credit Range Module", desc: "Show low/base/high credit estimates" },
          ].map((flag) => (
            <label key={flag.key} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-gray-50">
              <input
                type="checkbox"
                checked={(form.feature_flags as any)?.[flag.key] ?? false}
                onChange={(e) => setForm({
                  ...form,
                  feature_flags: { ...form.feature_flags, [flag.key]: e.target.checked },
                })}
                className="w-4 h-4 mt-0.5"
              />
              <div>
                <span className="text-sm font-medium">{flag.label}</span>
                <p className="text-xs text-gray-500">{flag.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Purchased Sections */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="text-lg font-semibold mb-4">Purchased Sections</h3>
        <p className="text-sm text-gray-500 mb-4">
          Select which tax sections are included in your subscription.
        </p>
        <div className="flex gap-4">
          <label className="flex items-center gap-3 p-4 border rounded-lg hover:bg-gray-50">
            <input
              type="checkbox"
              checked={form.purchased_sections?.includes("41") ?? true}
              onChange={(e) => {
                const sections = new Set(form.purchased_sections || []);
                if (e.target.checked) sections.add("41");
                else sections.delete("41");
                setForm({ ...form, purchased_sections: Array.from(sections) });
              }}
              className="w-5 h-5"
            />
            <div>
              <span className="font-medium">Section 41</span>
              <p className="text-xs text-gray-500">R&D Tax Credit</p>
            </div>
          </label>
          <label className="flex items-center gap-3 p-4 border rounded-lg hover:bg-gray-50">
            <input
              type="checkbox"
              checked={form.purchased_sections?.includes("174") ?? false}
              onChange={(e) => {
                const sections = new Set(form.purchased_sections || []);
                if (e.target.checked) sections.add("174");
                else sections.delete("174");
                setForm({ ...form, purchased_sections: Array.from(sections) });
              }}
              className="w-5 h-5"
            />
            <div>
              <span className="font-medium">Section 174</span>
              <p className="text-xs text-gray-500">R&E Capitalization</p>
            </div>
          </label>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {updateMutation.isPending ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// AUDIT EXPORTS TAB
// =============================================================================

function AuditExportsTab({
  setError,
  setSuccess,
}: {
  setError: (msg: string | null) => void;
  setSuccess: (msg: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [taxYear, setTaxYear] = useState(new Date().getFullYear());

  const { data: clients } = useQuery({
    queryKey: ["myClients"],
    queryFn: getMyClients,
  });

  const { data: exports, isLoading: loadingExports, refetch } = useQuery({
    queryKey: ["auditExports", selectedClientId],
    queryFn: () => listAuditExports(selectedClientId || undefined),
    refetchInterval: (query) => {
      // Refetch if any exports are pending
      const data = query.state.data;
      if (data?.some((e) => e.status === "queued" || e.status === "running")) {
        return 3000;
      }
      return false;
    },
  });

  const exportLogsMutation = useMutation({
    mutationFn: () => exportAuditLogs(selectedClientId!, taxYear),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auditExports"] });
      setSuccess("Audit log export started");
    },
    onError: (err: Error) => setError(err.message),
  });

  const exportDefensePackMutation = useMutation({
    mutationFn: () => exportDefensePack(selectedClientId!, taxYear),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auditExports"] });
      setSuccess("Defense pack export started");
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="text-lg font-semibold mb-4">Generate New Export</h3>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Client</label>
            <select
              value={selectedClientId || ""}
              onChange={(e) => setSelectedClientId(e.target.value || null)}
              className="w-64 p-2 border rounded-lg"
            >
              <option value="">Select a client...</option>
              {(clients?.clients || []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Tax Year</label>
            <input
              type="number"
              value={taxYear}
              onChange={(e) => setTaxYear(parseInt(e.target.value))}
              className="w-32 p-2 border rounded-lg"
            />
          </div>
          <button
            onClick={() => exportLogsMutation.mutate()}
            disabled={!selectedClientId || exportLogsMutation.isPending}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
          >
            {exportLogsMutation.isPending ? "Exporting..." : "Export Audit Logs (CSV)"}
          </button>
          <button
            onClick={() => exportDefensePackMutation.mutate()}
            disabled={!selectedClientId || exportDefensePackMutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {exportDefensePackMutation.isPending ? "Exporting..." : "Export Defense Pack (ZIP)"}
          </button>
        </div>
      </div>

      {/* Export History */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="font-semibold">Export History</h3>
          <button
            onClick={() => refetch()}
            className="text-sm text-blue-600 hover:underline"
          >
            Refresh
          </button>
        </div>
        {loadingExports ? (
          <div className="p-8 text-center text-gray-500">Loading exports...</div>
        ) : exports && exports.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left py-3 px-4 font-medium">Type</th>
                <th className="text-left py-3 px-4 font-medium">Status</th>
                <th className="text-left py-3 px-4 font-medium">Size</th>
                <th className="text-left py-3 px-4 font-medium">Created</th>
                <th className="text-left py-3 px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {exports.map((exp) => (
                <tr key={exp.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 text-xs rounded ${
                      exp.export_type === "defense_pack_zip" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"
                    }`}>
                      {exp.export_type === "defense_pack_zip" ? "Defense Pack" : "Audit Logs"}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 text-xs rounded ${
                      exp.status === "completed" ? "bg-green-100 text-green-700" :
                      exp.status === "failed" ? "bg-red-100 text-red-700" :
                      "bg-yellow-100 text-yellow-700"
                    }`}>
                      {exp.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-500">
                    {exp.file_size_bytes ? `${(exp.file_size_bytes / 1024).toFixed(1)} KB` : "—"}
                  </td>
                  <td className="py-3 px-4 text-gray-500">
                    {new Date(exp.created_at).toLocaleString()}
                  </td>
                  <td className="py-3 px-4">
                    {exp.status === "completed" && exp.download_url && (
                      <a
                        href={exp.download_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        Download
                      </a>
                    )}
                    {exp.status === "running" && (
                      <span className="text-gray-400">Processing...</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-gray-500">No exports found</div>
        )}
      </div>
    </div>
  );
}
