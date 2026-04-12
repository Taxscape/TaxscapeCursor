"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useActiveContext } from "@/context/workspace-context";
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
  type IntakeTemplate,
  type EmailDraftResponse,
} from "@/lib/intake";
import { getClientCompanies, type ClientCompany } from "@/lib/api";
import { useAuth } from "@/context/auth-context";

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
  sparkles: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3Z" />
    </svg>
  ),
  arrowRight: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="5" x2="19" y1="12" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  ),
};

// ============================================================================
// Main Component
// ============================================================================

export default function IntakePackagePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { clientId, taxYear } = useActiveContext();
  const { profile } = useAuth();

  // State
  const [selectedTaxYears, setSelectedTaxYears] = useState<number[]>([]);
  const [selectedTemplateTypes, setSelectedTemplateTypes] = useState<string[]>([]);
  const [generatedTemplates, setGeneratedTemplates] = useState<IntakeTemplate[]>([]);
  const [uploadLink, setUploadLink] = useState<string>("");
  const [emailDraft, setEmailDraft] = useState<EmailDraftResponse | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  
  // Edit contact modal
  const [editingContact, setEditingContact] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  // Workflow step
  const [step, setStep] = useState<"setup" | "templates" | "email" | "sent">("setup");

  // Fetch clients to get selected client details
  const { data: clientsData } = useQuery({
    queryKey: ["clients", profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      return getClientCompanies(profile.organization_id);
    },
    enabled: !!profile?.organization_id,
  });

  const clients = clientsData || [];
  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientId),
    [clients, clientId]
  );

  // Fetch existing session
  const { data: sessionData, refetch: refetchSession } = useQuery({
    queryKey: ["intake-session", clientId],
    queryFn: async () => {
      if (!clientId) return { session: null };
      return getIntakeSession(clientId);
    },
    enabled: !!clientId,
  });

  // Initialize when client changes
  useEffect(() => {
    if (selectedClient) {
      setContactName(selectedClient.contact_name || "");
      setContactEmail(selectedClient.contact_email || "");
      if (selectedClient.tax_year) {
        setSelectedTaxYears([parseInt(selectedClient.tax_year)]);
      }
    }
  }, [selectedClient]);

  // Generate templates mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("No client selected");
      return generateIntakeTemplates(
        clientId,
        selectedTaxYears,
        selectedTemplateTypes.length > 0 ? selectedTemplateTypes : undefined
      );
    },
    onSuccess: (data) => {
      if (data.success) {
        setGeneratedTemplates(data.templates);
        setStep("templates");
      }
    },
  });

  // Generate upload link mutation
  const uploadLinkMutation = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("No client selected");
      return generateUploadLink(clientId, selectedTaxYears);
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
      if (!clientId) throw new Error("No client selected");
      const templateIds = generatedTemplates.map((t) => t.id);
      return generateEmailDraft(clientId, selectedTaxYears, templateIds, uploadLink);
    },
    onSuccess: (data) => {
      if (data.success) {
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
      }
    },
  });

  // Update contact mutation
  const updateContactMutation = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("No client selected");
      return updateClientIntakeSettings(clientId, {
        primary_contact_name: contactName,
        primary_contact_email: contactEmail,
      });
    },
    onSuccess: () => {
      setEditingContact(false);
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

  // No client selected
  if (!clientId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center mb-4">
          {Icons.fileText}
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Select a Client</h2>
        <p className="text-gray-400 text-center max-w-md">
          Choose a client from the header to generate their intake package.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Intake Package Generator</h1>
        <p className="text-gray-400">
          Generate and send customized intake questionnaires to {selectedClient?.name || "your client"}
        </p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2">
        {["Setup", "Templates", "Email", "Sent"].map((label, i) => {
          const stepNames = ["setup", "templates", "email", "sent"];
          const isActive = step === stepNames[i];
          const isComplete = stepNames.indexOf(step) > i;
          return (
            <div key={label} className="flex items-center gap-2">
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                ${isComplete ? 'bg-green-500 text-white' : isActive ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-500'}
              `}>
                {isComplete ? '✓' : i + 1}
              </div>
              <span className={isActive ? 'text-white font-medium' : 'text-gray-500'}>{label}</span>
              {i < 3 && <div className="w-8 h-px bg-white/10" />}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      {step === "setup" && (
        <div className="space-y-6">
          {/* Client Info Card */}
          <div className="bg-[#12121a] border border-white/10 rounded-xl p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">{selectedClient?.name}</h3>
                <p className="text-sm text-gray-400">{selectedClient?.industry || 'No industry set'}</p>
              </div>
              <span className="px-3 py-1 bg-blue-500/20 text-blue-400 text-sm rounded-full">
                FY {taxYear}
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
              <div>
                <p className="text-xs text-gray-500 mb-1">Contact Name</p>
                <p className="text-white">{contactName || 'Not set'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Contact Email</p>
                <p className="text-white">{contactEmail || 'Not set'}</p>
              </div>
            </div>
            
            <button
              onClick={() => setEditingContact(true)}
              className="mt-4 text-sm text-blue-400 hover:text-blue-300"
            >
              Edit contact info
            </button>
          </div>

          {/* Tax Year Selection */}
          <div className="bg-[#12121a] border border-white/10 rounded-xl p-6">
            <h3 className="font-semibold text-white mb-4">Tax Years</h3>
            <div className="flex flex-wrap gap-2">
              {[2024, 2023, 2022, 2021].map((year) => (
                <button
                  key={year}
                  onClick={() => {
                    setSelectedTaxYears(prev => 
                      prev.includes(year) 
                        ? prev.filter(y => y !== year)
                        : [...prev, year]
                    );
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedTaxYears.includes(year)
                      ? 'bg-blue-500 text-white'
                      : 'bg-white/5 text-gray-400 hover:bg-white/10'
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
          </div>

          {/* Template Types */}
          <div className="bg-[#12121a] border border-white/10 rounded-xl p-6">
            <h3 className="font-semibold text-white mb-4">Template Types (Optional)</h3>
            <p className="text-sm text-gray-400 mb-4">
              Leave empty to generate all standard templates
            </p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(TEMPLATE_TYPE_LABELS).map(([type, label]) => (
                <button
                  key={type}
                  onClick={() => {
                    setSelectedTemplateTypes(prev => 
                      prev.includes(type) 
                        ? prev.filter(t => t !== type)
                        : [...prev, type]
                    );
                  }}
                  className={`px-4 py-3 rounded-lg text-sm text-left transition-colors ${
                    selectedTemplateTypes.includes(type)
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-transparent'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || selectedTaxYears.length === 0}
            className="w-full py-4 bg-blue-500 text-white rounded-xl font-semibold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {generateMutation.isPending ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              <>
                {Icons.sparkles}
                Generate Intake Package
              </>
            )}
          </button>
        </div>
      )}

      {step === "templates" && (
        <div className="space-y-6">
          <div className="bg-[#12121a] border border-white/10 rounded-xl p-6">
            <h3 className="font-semibold text-white mb-4">Generated Templates</h3>
            <div className="space-y-3">
              {generatedTemplates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-center justify-between p-4 bg-white/5 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {Icons.fileText}
                    <div>
                      <p className="font-medium text-white">
                        {TEMPLATE_TYPE_LABELS[template.template_type] || template.template_type}
                      </p>
                      <p className="text-sm text-gray-500">Version {template.template_version}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownload(template)}
                    className="px-4 py-2 bg-white/5 text-white rounded-lg hover:bg-white/10 flex items-center gap-2"
                  >
                    {Icons.download}
                    Download
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => uploadLinkMutation.mutate()}
              disabled={uploadLinkMutation.isPending}
              className="flex-1 py-3 bg-white/5 text-white rounded-xl font-medium hover:bg-white/10 flex items-center justify-center gap-2"
            >
              {Icons.link}
              {uploadLink ? 'Regenerate Link' : 'Generate Upload Link'}
            </button>
            <button
              onClick={() => emailDraftMutation.mutate()}
              disabled={emailDraftMutation.isPending || !uploadLink}
              className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {Icons.mail}
              Generate Email Draft
            </button>
          </div>

          {uploadLink && (
            <div className="bg-[#12121a] border border-white/10 rounded-xl p-6">
              <h3 className="font-semibold text-white mb-2">Client Upload Link</h3>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={uploadLink}
                  readOnly
                  className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm"
                />
                <button
                  onClick={() => copyToClipboard(uploadLink, "link")}
                  className="px-4 py-2 bg-white/5 text-white rounded-lg hover:bg-white/10"
                >
                  {copiedLink ? Icons.check : Icons.copy}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {step === "email" && emailDraft && (
        <div className="space-y-6">
          <div className="bg-[#12121a] border border-white/10 rounded-xl p-6">
            <div className="mb-4">
              <p className="text-sm text-gray-400 mb-1">To:</p>
              <p className="text-white">
                {emailDraft.to_recipients.map(r => r.email).join(', ')}
              </p>
            </div>
            <div className="mb-4">
              <p className="text-sm text-gray-400 mb-1">Subject:</p>
              <p className="text-white">{emailDraft.subject}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-1">Body:</p>
              <div className="bg-white/5 rounded-lg p-4 whitespace-pre-wrap text-gray-300 text-sm">
                {emailDraft.body_text}
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => copyToClipboard(`Subject: ${emailDraft.subject}\n\n${emailDraft.body_text}`, "email")}
              className="flex-1 py-3 bg-white/5 text-white rounded-xl font-medium hover:bg-white/10 flex items-center justify-center gap-2"
            >
              {copiedEmail ? Icons.check : Icons.copy}
              {copiedEmail ? 'Copied!' : 'Copy Email'}
            </button>
            <button
              onClick={() => markSentMutation.mutate()}
              disabled={markSentMutation.isPending}
              className="flex-1 py-3 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {Icons.send}
              Mark as Sent
            </button>
          </div>
        </div>
      )}

      {step === "sent" && (
        <div className="text-center py-12">
          <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6 text-green-400">
            {Icons.check}
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Intake Package Sent!</h2>
          <p className="text-gray-400 mb-8">
            The intake package has been marked as sent. You can track responses in the Intake Inbox.
          </p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => router.push('/testscape/intake-inbox')}
              className="px-6 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 flex items-center gap-2"
            >
              View Intake Inbox
              {Icons.arrowRight}
            </button>
            <button
              onClick={() => {
                setStep("setup");
                setGeneratedTemplates([]);
                setUploadLink("");
                setEmailDraft(null);
              }}
              className="px-6 py-3 bg-white/5 text-white rounded-xl font-medium hover:bg-white/10"
            >
              Create Another Package
            </button>
          </div>
        </div>
      )}

      {/* Edit Contact Modal */}
      {editingContact && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#1a1a22] border border-white/10 rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">Edit Contact Information</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Contact Name</label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Contact Email</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingContact(false)}
                className="flex-1 py-2 bg-white/5 text-white rounded-lg hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={() => updateContactMutation.mutate()}
                disabled={updateContactMutation.isPending}
                className="flex-1 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                {updateContactMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
