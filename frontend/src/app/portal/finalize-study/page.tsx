"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getStudyReadiness,
  finalizeStudy,
  getStudy,
  listStudies,
  retryArtifact,
  completeStudy,
  generateEmailDraft,
  markEmailSent,
  getArtifactLabel,
  STUDY_COMPLETION_REASON_CODES,
  ReadinessCheck,
  Study,
  ArtifactInfo,
  EmailDraft,
} from "@/lib/study-packaging";

export default function FinalizeStudyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const clientId = searchParams.get("client_id") || "";
  const taxYear = parseInt(searchParams.get("tax_year") || new Date().getFullYear().toString());

  const [selectedStudyId, setSelectedStudyId] = useState<string | null>(null);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideReasons, setOverrideReasons] = useState<Record<string, string>>({});
  const [completeModal, setCompleteModal] = useState(false);
  const [completeReasonCode, setCompleteReasonCode] = useState("");
  const [completeNote, setCompleteNote] = useState("");
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch readiness
  const { data: readiness, isLoading: loadingReadiness, refetch: refetchReadiness } = useQuery({
    queryKey: ["studyReadiness", clientId, taxYear],
    queryFn: () => getStudyReadiness(clientId, taxYear),
    enabled: !!clientId,
  });

  // Fetch studies
  const { data: studiesData, isLoading: loadingStudies } = useQuery({
    queryKey: ["studies", clientId, taxYear],
    queryFn: () => listStudies(clientId, taxYear),
    enabled: !!clientId,
  });

  // Fetch selected study details
  const { data: selectedStudy, isLoading: loadingStudy } = useQuery({
    queryKey: ["study", selectedStudyId],
    queryFn: () => getStudy(selectedStudyId!),
    enabled: !!selectedStudyId,
    refetchInterval: (query) => {
      if (query.state.data?.status === "finalizing") return 3000;
      return false;
    },
  });

  // Auto-select latest study
  useEffect(() => {
    if (studiesData?.studies?.length && !selectedStudyId) {
      const latest = studiesData.studies[0];
      setSelectedStudyId(latest.id);
    }
  }, [studiesData, selectedStudyId]);

  // Finalize mutation
  const finalizeMutation = useMutation({
    mutationFn: finalizeStudy,
    onSuccess: (data) => {
      setSelectedStudyId(data.study_id);
      queryClient.invalidateQueries({ queryKey: ["studies", clientId, taxYear] });
      queryClient.invalidateQueries({ queryKey: ["studyReadiness", clientId, taxYear] });
      setShowOverrideModal(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  // Retry artifact mutation
  const retryMutation = useMutation({
    mutationFn: ({ studyId, artifactType }: { studyId: string; artifactType: string }) =>
      retryArtifact(studyId, artifactType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["study", selectedStudyId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  // Complete study mutation
  const completeMutation = useMutation({
    mutationFn: ({ studyId, reasonCode, note }: { studyId: string; reasonCode: string; note: string }) =>
      completeStudy(studyId, { reason_code: reasonCode, note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["study", selectedStudyId] });
      queryClient.invalidateQueries({ queryKey: ["studies", clientId, taxYear] });
      setCompleteModal(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  // Email draft mutation
  const emailDraftMutation = useMutation({
    mutationFn: (studyId: string) => generateEmailDraft(studyId),
    onSuccess: (data) => setEmailDraft(data),
    onError: (err: Error) => setError(err.message),
  });

  // Mark sent mutation
  const markSentMutation = useMutation({
    mutationFn: (studyId: string) => markEmailSent(studyId),
    onSuccess: () => setEmailDraft(null),
    onError: (err: Error) => setError(err.message),
  });

  const handleFinalize = () => {
    if (!clientId) return;
    if (readiness && readiness.blocking_count > 0) {
      setShowOverrideModal(true);
    } else {
      finalizeMutation.mutate({
        client_company_id: clientId,
        tax_year: taxYear,
        allow_overrides: false,
      });
    }
  };

  const handleFinalizeWithOverrides = () => {
    const blockers = readiness?.checks.filter((c) => c.blocking && c.status === "fail") || [];
    const reasons = blockers.map((b) => ({
      check_id: b.check_id,
      reason: overrideReasons[b.check_id] || "Senior override",
    }));
    finalizeMutation.mutate({
      client_company_id: clientId,
      tax_year: taxYear,
      allow_overrides: true,
      override_reasons: reasons,
    });
  };

  const handleComplete = () => {
    if (!selectedStudyId || !completeReasonCode || !completeNote) return;
    completeMutation.mutate({
      studyId: selectedStudyId,
      reasonCode: completeReasonCode,
      note: completeNote,
    });
  };

  if (!clientId) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">Select a client to view study finalization options.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Finalize Study</h1>
            <p className="text-sm text-gray-500">Tax Year {taxYear}</p>
          </div>
          <button
            onClick={() => router.push("/portal")}
            className="text-sm text-blue-600 hover:underline"
          >
            ← Back to Portal
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Readiness Checklist */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Readiness Checklist</h2>
            <button
              onClick={() => refetchReadiness()}
              className="text-sm text-blue-600 hover:underline"
            >
              Refresh
            </button>
          </div>

          {loadingReadiness ? (
            <p className="text-gray-500">Loading checks...</p>
          ) : readiness ? (
            <div className="space-y-3">
              {readiness.checks.map((check) => (
                <div
                  key={check.check_id}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    check.status === "pass"
                      ? "bg-green-50 border-green-200"
                      : check.status === "fail"
                      ? "bg-red-50 border-red-200"
                      : "bg-yellow-50 border-yellow-200"
                  }`}
                >
                  <div className="mt-0.5">
                    {check.status === "pass" ? (
                      <span className="text-green-600 text-lg">✓</span>
                    ) : check.status === "fail" ? (
                      <span className="text-red-600 text-lg">✗</span>
                    ) : (
                      <span className="text-yellow-600 text-lg">⚠</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{check.message}</p>
                    {check.remediation?.href && (
                      <a
                        href={check.remediation.href}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        Go to {check.remediation.target} →
                      </a>
                    )}
                  </div>
                  {check.blocking && check.status === "fail" && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">
                      Blocker
                    </span>
                  )}
                </div>
              ))}

              <div className="pt-4 border-t flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  {readiness.blocking_count} blocker(s), {readiness.warning_count} warning(s)
                </div>
                <button
                  onClick={handleFinalize}
                  disabled={finalizeMutation.isPending}
                  className={`px-6 py-2 rounded-lg font-medium transition ${
                    readiness.blocking_count > 0
                      ? "bg-yellow-600 hover:bg-yellow-700 text-white"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  } disabled:opacity-50`}
                >
                  {finalizeMutation.isPending
                    ? "Starting..."
                    : readiness.blocking_count > 0
                    ? "Finalize with Overrides"
                    : "Finalize Study"}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">No readiness data available.</p>
          )}
        </div>

        {/* Studies List */}
        {studiesData?.studies && studiesData.studies.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-semibold mb-4">Study Versions</h2>
            <div className="space-y-2">
              {studiesData.studies.map((study) => (
                <button
                  key={study.id}
                  onClick={() => setSelectedStudyId(study.id)}
                  className={`w-full text-left p-3 rounded-lg border transition ${
                    selectedStudyId === study.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Version {study.study_version}</span>
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        study.status === "complete"
                          ? "bg-green-100 text-green-700"
                          : study.status === "final"
                          ? "bg-blue-100 text-blue-700"
                          : study.status === "finalizing"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {study.status}
                    </span>
                  </div>
                  {study.finalized_at && (
                    <p className="text-xs text-gray-500 mt-1">
                      Finalized: {new Date(study.finalized_at).toLocaleString()}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Selected Study Details */}
        {selectedStudy && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                Study v{selectedStudy.study_version} — Artifacts
              </h2>
              {selectedStudy.locked_at && (
                <span className="text-xs bg-gray-800 text-white px-2 py-1 rounded">
                  🔒 Locked
                </span>
              )}
            </div>

            {selectedStudy.status === "finalizing" && (
              <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-yellow-800 font-medium">Generating artifacts...</p>
                <p className="text-sm text-yellow-700">This page will refresh automatically.</p>
              </div>
            )}

            <div className="space-y-3">
              {selectedStudy.artifacts.map((art) => (
                <div
                  key={art.artifact_type}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{getArtifactLabel(art.artifact_type)}</p>
                    <p className="text-xs text-gray-500">
                      Status:{" "}
                      <span
                        className={
                          art.generation_status === "completed"
                            ? "text-green-600"
                            : art.generation_status === "failed"
                            ? "text-red-600"
                            : "text-yellow-600"
                        }
                      >
                        {art.generation_status}
                      </span>
                      {art.error && <span className="text-red-500 ml-2">— {art.error}</span>}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {art.generation_status === "completed" && art.download_url && (
                      <a
                        href={art.download_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline"
                      >
                        Download
                      </a>
                    )}
                    {art.generation_status === "failed" && (
                      <button
                        onClick={() =>
                          retryMutation.mutate({
                            studyId: selectedStudy.id,
                            artifactType: art.artifact_type,
                          })
                        }
                        disabled={retryMutation.isPending}
                        className="text-sm text-orange-600 hover:underline"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            {selectedStudy.status === "final" && (
              <div className="mt-6 pt-4 border-t flex flex-wrap gap-3">
                <button
                  onClick={() => setCompleteModal(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                >
                  Mark Study Complete
                </button>
                <button
                  onClick={() => emailDraftMutation.mutate(selectedStudy.id)}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
                >
                  Generate Email Draft
                </button>
              </div>
            )}

            {selectedStudy.status === "complete" && (
              <div className="mt-6 pt-4 border-t">
                <div className="flex items-center gap-2 text-green-700">
                  <span className="text-xl">✓</span>
                  <span className="font-medium">Study Complete</span>
                </div>
                {selectedStudy.signoffs.length > 0 && (
                  <div className="mt-2 text-sm text-gray-600">
                    Signed off by: {selectedStudy.signoffs[0].decided_by_user_id} on{" "}
                    {new Date(selectedStudy.signoffs[0].decided_at).toLocaleString()}
                  </div>
                )}
                <button
                  onClick={() => emailDraftMutation.mutate(selectedStudy.id)}
                  className="mt-4 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
                >
                  Generate Delivery Email
                </button>
              </div>
            )}
          </div>
        )}

        {/* Override Modal */}
        {showOverrideModal && readiness && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
              <h3 className="text-lg font-semibold mb-4">Override Blockers</h3>
              <p className="text-sm text-gray-600 mb-4">
                The following items are blocking finalization. Provide a reason for each override.
              </p>
              <div className="space-y-4">
                {readiness.checks
                  .filter((c) => c.blocking && c.status === "fail")
                  .map((check) => (
                    <div key={check.check_id} className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="font-medium text-red-800 text-sm">{check.message}</p>
                      <textarea
                        placeholder="Override reason..."
                        value={overrideReasons[check.check_id] || ""}
                        onChange={(e) =>
                          setOverrideReasons((prev) => ({
                            ...prev,
                            [check.check_id]: e.target.value,
                          }))
                        }
                        className="mt-2 w-full p-2 border rounded text-sm"
                        rows={2}
                      />
                    </div>
                  ))}
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setShowOverrideModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleFinalizeWithOverrides}
                  disabled={finalizeMutation.isPending}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
                >
                  {finalizeMutation.isPending ? "Processing..." : "Proceed with Overrides"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Complete Modal */}
        {completeModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4">
              <h3 className="text-lg font-semibold mb-4">Mark Study Complete</h3>
              <p className="text-sm text-gray-600 mb-4">
                This will lock the study and prevent further changes.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Reason Code</label>
                  <select
                    value={completeReasonCode}
                    onChange={(e) => setCompleteReasonCode(e.target.value)}
                    className="w-full p-2 border rounded-lg"
                  >
                    <option value="">Select reason...</option>
                    {STUDY_COMPLETION_REASON_CODES.map((rc) => (
                      <option key={rc.value} value={rc.value}>
                        {rc.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Note</label>
                  <textarea
                    value={completeNote}
                    onChange={(e) => setCompleteNote(e.target.value)}
                    placeholder="Add any additional notes..."
                    className="w-full p-2 border rounded-lg"
                    rows={3}
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setCompleteModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleComplete}
                  disabled={completeMutation.isPending || !completeReasonCode || !completeNote}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {completeMutation.isPending ? "Completing..." : "Complete Study"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Email Draft Modal */}
        {emailDraft && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
              <h3 className="text-lg font-semibold mb-4">Delivery Email Draft</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-500">To</label>
                  <p className="text-gray-900">{emailDraft.to_email || "Not specified"}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Subject</label>
                  <p className="text-gray-900">{emailDraft.subject}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Body</label>
                  <pre className="mt-1 p-3 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap">
                    {emailDraft.body}
                  </pre>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setEmailDraft(null)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(emailDraft.body);
                    alert("Email body copied to clipboard!");
                  }}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  Copy Body
                </button>
                <button
                  onClick={() => selectedStudyId && markSentMutation.mutate(selectedStudyId)}
                  disabled={markSentMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {markSentMutation.isPending ? "Marking..." : "Mark as Sent"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
