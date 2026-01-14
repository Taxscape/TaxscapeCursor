"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import {
  generateIntakeTemplates,
  listClientTemplates,
  downloadTemplate,
  generateUploadLink,
  generateEmailDraft,
  markEmailSent,
  getIntakeSession,
  updateClientIntakeSettings,
  TEMPLATE_TYPE_LABELS,
  TEMPLATE_TYPE_ICONS,
  type IntakeTemplate,
  type EmailDraftResponse,
  type IntakeSession,
  type ClientIntakeSettings,
} from "@/lib/intake";
import { getClientCompanies, type ClientCompany } from "@/lib/api";

// ============================================================================
// Icons
// ============================================================================

const Icons = {
  fileText: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" x2="8" y1="13" y2="13" />
      <line x1="16" x2="8" y1="17" y2="17" />
    </svg>
  ),
  download: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  ),
  mail: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  link: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  check: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  copy: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  ),
  send: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="22" x2="11" y1="2" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  ),
  clock: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  arrowLeft: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="19" x2="5" y1="12" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  ),
  sparkles: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3Z" />
    </svg>
  ),
  alertCircle: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  ),
  building: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
      <line x1="9" x2="9" y1="6" y2="6" />
      <line x1="15" x2="15" y1="6" y2="6" />
      <line x1="9" x2="9" y1="10" y2="10" />
      <line x1="15" x2="15" y1="10" y2="10" />
      <line x1="9" x2="9" y1="14" y2="14" />
      <line x1="15" x2="15" y1="14" y2="14" />
      <line x1="9" x2="15" y1="18" y2="18" />
    </svg>
  ),
  refresh: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  ),
  inbox: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  ),
};

// ============================================================================
// Main Component
// ============================================================================

function IntakePackageGeneratorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user, profile, isLoading: authLoading } = useAuth();

  // URL params
  const clientIdParam = searchParams.get("client_id");
  const fromOnboarding = searchParams.get("from") === "onboarding";
  const onboardingSessionId = searchParams.get("onboarding_session_id");

  // State
  const [selectedClientId, setSelectedClientId] = useState<string>(clientIdParam || "");
  const [selectedTaxYears, setSelectedTaxYears] = useState<number[]>([new Date().getFullYear() - 1]);
  const [selectedTemplateTypes, setSelectedTemplateTypes] = useState<string[]>([]);
  const [generatedTemplates, setGeneratedTemplates] = useState<IntakeTemplate[]>([]);
  const [uploadLink, setUploadLink] = useState<string>("");
  const [emailDraft, setEmailDraft] = useState<EmailDraftResponse | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showMissingFields, setShowMissingFields] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  
  // Edit contact modal
  const [editingContact, setEditingContact] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  // Workflow state
  const [step, setStep] = useState<"setup" | "templates" | "email" | "sent">("setup");

  // Fetch clients
  const { data: clientsData, isLoading: clientsLoading } = useQuery({
    queryKey: ["clients", profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const result = await getClientCompanies(profile.organization_id);
      return result || [];
    },
    enabled: !!profile?.organization_id,
  });

  const clients = clientsData || [];
  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId),
    [clients, selectedClientId]
  );

  // Fetch existing templates
  const { data: existingTemplatesData, refetch: refetchTemplates } = useQuery({
    queryKey: ["intake-templates", selectedClientId],
    queryFn: async () => {
      if (!selectedClientId) return { templates: [] };
      return listClientTemplates(selectedClientId);
    },
    enabled: !!selectedClientId,
  });

  // Fetch existing session
  const { data: sessionData, refetch: refetchSession } = useQuery({
    queryKey: ["intake-session", selectedClientId],
    queryFn: async () => {
      if (!selectedClientId) return { session: null };
      return getIntakeSession(selectedClientId);
    },
    enabled: !!selectedClientId,
  });

  const existingSession = sessionData?.session;

  // Auto-select client from URL param
  useEffect(() => {
    if (clientIdParam && !selectedClientId) {
      setSelectedClientId(clientIdParam);
    }
  }, [clientIdParam, selectedClientId]);

  // Auto-populate contact info when client selected
  useEffect(() => {
    if (selectedClient) {
      setContactName(selectedClient.primary_contact_name || selectedClient.contact_name || "");
      setContactEmail(selectedClient.primary_contact_email || selectedClient.contact_email || "");
      
      // Set default tax year from client
      if (selectedClient.tax_year) {
        setSelectedTaxYears([parseInt(selectedClient.tax_year)]);
      }
    }
  }, [selectedClient]);

  // Generate templates mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedClientId) throw new Error("No client selected");
      return generateIntakeTemplates(
        selectedClientId,
        selectedTaxYears,
        selectedTemplateTypes.length > 0 ? selectedTemplateTypes : undefined,
        onboardingSessionId || undefined
      );
    },
    onSuccess: (data) => {
      if (!data.success && data.missing_fields) {
        setMissingFields(data.missing_fields);
        setShowMissingFields(true);
      } else if (data.success) {
        setGeneratedTemplates(data.templates);
        setStep("templates");
        refetchTemplates();
      }
    },
  });

  // Generate upload link mutation
  const uploadLinkMutation = useMutation({
    mutationFn: async () => {
      if (!selectedClientId) throw new Error("No client selected");
      return generateUploadLink(selectedClientId, selectedTaxYears);
    },
    onSuccess: (data) => {
      if (data.success) {
        setUploadLink(data.upload_link);
      }
    },
  });

  // Generate email draft mutation
  const emailDraftMutation = useMutation({
    mutationFn: async () => {
      if (!selectedClientId) throw new Error("No client selected");
      const templateIds = generatedTemplates.map((t) => t.id);
      return generateEmailDraft(selectedClientId, selectedTaxYears, templateIds, uploadLink);
    },
    onSuccess: (data) => {
      if (!data.success && data.missing_fields) {
        setMissingFields(data.missing_fields);
        setShowMissingFields(true);
      } else if (data.success) {
        setEmailDraft(data);
        setStep("email");
      }
    },
  });

  // Mark sent mutation
  const markSentMutation = useMutation({
    mutationFn: async () => {
      if (!emailDraft?.draft_id) throw new Error("No email draft");
      return markEmailSent(emailDraft.draft_id);
    },
    onSuccess: (data) => {
      if (data.success) {
        setStep("sent");
        refetchSession();
        queryClient.invalidateQueries({ queryKey: ["clients"] });
      }
    },
  });

  // Update contact mutation
  const updateContactMutation = useMutation({
    mutationFn: async () => {
      if (!selectedClientId) throw new Error("No client selected");
      return updateClientIntakeSettings(selectedClientId, {
        primary_contact_name: contactName,
        primary_contact_email: contactEmail,
      });
    },
    onSuccess: () => {
      setEditingContact(false);
      setShowMissingFields(false);
      setMissingFields([]);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });

  // Handle template download
  const handleDownload = async (template: IntakeTemplate) => {
    try {
      const url = await downloadTemplate(template.id);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${template.template_type}_v${template.template_version}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  // Copy to clipboard
  const copyToClipboard = async (text: string, type: "email" | "link") => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "email") {
        setCopiedEmail(true);
        setTimeout(() => setCopiedEmail(false), 2000);
      } else {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      }
    } catch (error) {
      console.error("Copy failed:", error);
    }
  };

  // Auth check
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!user) {
    router.push("/login?redirect=/portal/intake");
    return null;
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0a0a0f]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/portal")}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              {Icons.arrowLeft}
            </button>
            <div>
              <h1 className="text-xl font-semibold">Intake Package Generator</h1>
              <p className="text-sm text-gray-400">
                {fromOnboarding
                  ? "Generate templates and send data request to your client"
                  : "Create and send intake documents"}
              </p>
            </div>
          </div>
          {existingSession && existingSession.status === "awaiting_client" && (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 text-amber-400 rounded-lg">
              {Icons.clock}
              <span className="text-sm">Awaiting client response</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Step Indicator */}
        <div className="flex items-center justify-center mb-12">
          <div className="flex items-center gap-4">
            {[
              { key: "setup", label: "Setup", icon: Icons.building },
              { key: "templates", label: "Templates", icon: Icons.fileText },
              { key: "email", label: "Email Draft", icon: Icons.mail },
              { key: "sent", label: "Sent", icon: Icons.check },
            ].map((s, i) => (
              <div key={s.key} className="flex items-center">
                <div
                  className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
                    step === s.key
                      ? "bg-blue-600 text-white"
                      : ["templates", "email", "sent"].indexOf(step) > ["setup", "templates", "email", "sent"].indexOf(s.key)
                      ? "bg-green-600/20 text-green-400"
                      : "bg-white/5 text-gray-500"
                  }`}
                >
                  {s.icon}
                  <span className="text-sm font-medium">{s.label}</span>
                </div>
                {i < 3 && (
                  <div className="w-12 h-px bg-white/10 mx-2" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Missing Fields Modal */}
        {showMissingFields && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4">
              <div className="flex items-center gap-3 text-amber-400 mb-4">
                {Icons.alertCircle}
                <h3 className="text-lg font-semibold">Missing Information</h3>
              </div>
              <p className="text-gray-400 mb-4">
                Please provide the following information to continue:
              </p>
              <ul className="space-y-2 mb-6">
                {missingFields.map((field) => (
                  <li key={field} className="flex items-center gap-2 text-gray-300">
                    <span className="w-2 h-2 bg-amber-400 rounded-full" />
                    {field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </li>
                ))}
              </ul>
              {missingFields.includes("primary_contact_email") && (
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Contact Name</label>
                    <input
                      type="text"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-blue-500"
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Contact Email *</label>
                    <input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-blue-500"
                      placeholder="john@company.com"
                    />
                  </div>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowMissingFields(false)}
                  className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                {missingFields.includes("primary_contact_email") && contactEmail && (
                  <button
                    onClick={() => updateContactMutation.mutate()}
                    disabled={updateContactMutation.isPending}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {updateContactMutation.isPending ? "Saving..." : "Save & Continue"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step: Setup */}
        {step === "setup" && (
          <div className="space-y-8">
            {/* Client Selection */}
            <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                {Icons.building}
                Client & Study Details
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Client Company *</label>
                  <select
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Select a client...</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name} (FY{client.tax_year})
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Tax Year(s) *</label>
                  <div className="flex flex-wrap gap-2">
                    {[2021, 2022, 2023, 2024, 2025].map((year) => (
                      <button
                        key={year}
                        onClick={() => {
                          if (selectedTaxYears.includes(year)) {
                            setSelectedTaxYears(selectedTaxYears.filter((y) => y !== year));
                          } else {
                            setSelectedTaxYears([...selectedTaxYears, year]);
                          }
                        }}
                        className={`px-4 py-2 rounded-lg border transition-all ${
                          selectedTaxYears.includes(year)
                            ? "bg-blue-600 border-blue-500 text-white"
                            : "bg-white/5 border-white/10 hover:border-white/20"
                        }`}
                      >
                        {year}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Client Summary */}
              {selectedClient && (
                <div className="mt-6 p-4 bg-white/5 rounded-lg">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Contact:</span>
                      <p className="text-gray-300">{contactName || "Not set"}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Email:</span>
                      <p className="text-gray-300">{contactEmail || "Not set"}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Industry:</span>
                      <p className="text-gray-300">{selectedClient.industry || "Not specified"}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Scope:</span>
                      <p className="text-gray-300">{selectedClient.study_scope || "Full study"}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setEditingContact(true)}
                    className="mt-4 text-sm text-blue-400 hover:text-blue-300"
                  >
                    Edit contact information
                  </button>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end">
              <button
                onClick={() => generateMutation.mutate()}
                disabled={!selectedClientId || selectedTaxYears.length === 0 || generateMutation.isPending}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generateMutation.isPending ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    {Icons.sparkles}
                    Generate Templates
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step: Templates */}
        {step === "templates" && (
          <div className="space-y-8">
            {/* Generated Templates */}
            <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  {Icons.fileText}
                  Generated Templates
                </h2>
                <span className="text-sm text-gray-400">
                  {generatedTemplates.length} templates ready
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {generatedTemplates.map((template) => (
                  <div
                    key={template.id}
                    className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        {TEMPLATE_TYPE_ICONS[template.template_type] || "📄"}
                      </span>
                      <div>
                        <p className="font-medium">
                          {TEMPLATE_TYPE_LABELS[template.template_type] || template.template_type}
                        </p>
                        <p className="text-sm text-gray-400">Version {template.template_version}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDownload(template)}
                      className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                      title="Download"
                    >
                      {Icons.download}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Upload Link */}
            <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  {Icons.link}
                  Upload Link
                </h2>
                {!uploadLink && (
                  <button
                    onClick={() => uploadLinkMutation.mutate()}
                    disabled={uploadLinkMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    {Icons.link}
                    Generate Link
                  </button>
                )}
              </div>

              {uploadLink ? (
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={uploadLink}
                    readOnly
                    className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm"
                  />
                  <button
                    onClick={() => copyToClipboard(uploadLink, "link")}
                    className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    {copiedLink ? Icons.check : Icons.copy}
                    {copiedLink ? "Copied!" : "Copy"}
                  </button>
                </div>
              ) : (
                <p className="text-gray-400 text-sm">
                  Generate a secure upload link for your client to submit documents.
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-between">
              <button
                onClick={() => setStep("setup")}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
              >
                {Icons.arrowLeft}
                Back
              </button>
              <button
                onClick={() => emailDraftMutation.mutate()}
                disabled={emailDraftMutation.isPending}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl font-medium transition-colors disabled:opacity-50"
              >
                {emailDraftMutation.isPending ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Generating Email...
                  </>
                ) : (
                  <>
                    {Icons.mail}
                    Generate Email Draft
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step: Email */}
        {step === "email" && emailDraft && (
          <div className="space-y-8">
            {/* Email Preview */}
            <div className="bg-[#12121a] border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 bg-white/5">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  {Icons.mail}
                  Email Draft Preview
                </h2>
              </div>
              
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-sm text-gray-400">To:</label>
                  <p className="text-gray-200">
                    {emailDraft.to_recipients.map((r) => `${r.name} <${r.email}>`).join(", ")}
                  </p>
                </div>
                <div>
                  <label className="text-sm text-gray-400">Subject:</label>
                  <p className="text-gray-200 font-medium">{emailDraft.subject}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-400">Body:</label>
                  <div className="mt-2 p-4 bg-white/5 rounded-lg whitespace-pre-wrap text-sm text-gray-300 max-h-96 overflow-y-auto">
                    {emailDraft.body_text}
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-between">
              <button
                onClick={() => setStep("templates")}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
              >
                {Icons.arrowLeft}
                Back
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => copyToClipboard(emailDraft.body_text, "email")}
                  className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-medium transition-colors"
                >
                  {copiedEmail ? Icons.check : Icons.copy}
                  {copiedEmail ? "Copied!" : "Copy Email"}
                </button>
                <button
                  onClick={() => markSentMutation.mutate()}
                  disabled={markSentMutation.isPending}
                  className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                  {markSentMutation.isPending ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      {Icons.send}
                      Mark as Sent
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step: Sent */}
        {step === "sent" && (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-green-600/20 rounded-full mb-6">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-400">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-4">Intake Package Sent!</h2>
            <p className="text-gray-400 mb-8 max-w-md mx-auto">
              Your client has been notified. You&apos;ll be able to track their submissions in the Intake Inbox.
            </p>

            {/* Expected Inputs Checklist */}
            {existingSession && (
              <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 max-w-lg mx-auto mb-8 text-left">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  {Icons.inbox}
                  Expected Documents
                </h3>
                <div className="space-y-3">
                  {Object.entries(existingSession.expected_inputs || {}).map(([key, input]) => (
                    <div
                      key={key}
                      className={`flex items-center justify-between p-3 rounded-lg ${
                        input.required ? "bg-white/5" : "bg-white/[0.02]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            input.status === "received"
                              ? "bg-green-400"
                              : input.status === "verified"
                              ? "bg-blue-400"
                              : "bg-gray-500"
                          }`}
                        />
                        <span className="text-sm">{input.description}</span>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          input.required
                            ? "bg-amber-500/20 text-amber-400"
                            : "bg-gray-500/20 text-gray-400"
                        }`}
                      >
                        {input.required ? "Required" : "Optional"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-center gap-4">
              <button
                onClick={() => router.push("/portal")}
                className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-medium transition-colors"
              >
                {Icons.arrowLeft}
                Back to Portal
              </button>
              <button
                onClick={() => router.push("/portal?view=intake-inbox")}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl font-medium transition-colors"
              >
                {Icons.inbox}
                View Intake Inbox
              </button>
            </div>
          </div>
        )}

        {/* Edit Contact Modal */}
        {editingContact && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4">Edit Contact Information</h3>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Contact Name</label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-blue-500"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Contact Email</label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-blue-500"
                    placeholder="john@company.com"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setEditingContact(false)}
                  className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => updateContactMutation.mutate()}
                  disabled={updateContactMutation.isPending}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {updateContactMutation.isPending ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function IntakePackageGeneratorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>}>
      <IntakePackageGeneratorContent />
    </Suspense>
  );
}
