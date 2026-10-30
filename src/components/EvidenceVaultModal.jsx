import React, { useEffect, useRef, useState } from 'react';
import { 
  Lock, Camera, Upload, Shield, CheckCircle, FileText, X, AlertTriangle, 
  Image as ImageIcon, Film, Download, Eye, RefreshCw, Paperclip,
  Share2, ShieldCheck, ShieldAlert, UserCheck
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export default function EvidenceVaultModal({ caseId, onClose }) {
  const [evidenceList, setEvidenceList] = useState([]);
  const [cases, setCases] = useState([]);
  const [mode, setMode] = useState('text'); // 'text' | 'media'
  const [note, setNote] = useState('');
  const [title, setTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [previewMedia, setPreviewMedia] = useState(null); // { url, type, title }
  const fileInputRef = useRef(null);

  // Evidence Sharing States
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedEvidenceToShare, setSelectedEvidenceToShare] = useState(null);
  const [targetCaseId, setTargetCaseId] = useState(caseId || '');
  const [isSharing, setIsSharing] = useState(false);

  // Evidence Revocation States
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [selectedEvidenceToRevoke, setSelectedEvidenceToRevoke] = useState(null);
  const [isRevoking, setIsRevoking] = useState(false);

  useEffect(() => {
    loadCases();
    if (caseId) loadEvidence(caseId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const loadCases = async () => {
    try {
      const { data } = await api.get('/cases/mine');
      setCases(data || []);
      if (!targetCaseId && data && data.length > 0) {
        setTargetCaseId(caseId || data[0].id);
        if (!caseId) loadEvidence(data[0].id);
      }
    } catch (e) {
      console.warn('Could not load user cases:', e);
    }
  };

  const loadEvidence = async (activeId = caseId || targetCaseId) => {
    if (!activeId) return;
    try {
      const { data } = await api.get(`/evidence/${activeId}`);
      setEvidenceList(data.evidence || []);
    } catch (e) {
      console.warn('Could not load evidence:', e);
    }
  };

  const handleCaptureSnapshot = async () => {
    if (!note.trim()) {
      return toast.error('Please add incident details or description');
    }
    setUploading(true);
    try {
      const { data } = await api.post('/evidence/upload', {
        case_id: caseId,
        title: title.trim() || 'Stealth Covert Snapshot',
        content: note.trim(),
        location: 'Verified GPS Coordinate',
      });
      toast.success(`Evidence sealed with hash: ${data.hash}`);
      setNote('');
      setTitle('');
      loadEvidence();
    } catch {
      toast.error('Failed to log evidence');
    } finally {
      setUploading(false);
    }
  };

  const handleUploadFile = async () => {
    if (!selectedFile) {
      return toast.error('Please select an image or video file to preserve.');
    }
    if (selectedFile.size > 25 * 1024 * 1024) {
      return toast.error('File exceeds 25MB maximum size limit.');
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('case_id', caseId);
      formData.append('title', title.trim() || selectedFile.name || 'Covert Media Evidence');
      formData.append('notes', note.trim() || 'Visual evidence sealed in encrypted vault');
      formData.append('location', 'Verified GPS Coordinate');

      const { data } = await api.post('/evidence/upload-file', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(`Media encrypted and sealed with hash: ${data.hash}`);
      setSelectedFile(null);
      setTitle('');
      setNote('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadEvidence();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to upload media evidence');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadMedia = async (item) => {
    if (!item.media_url) return;
    try {
      toast.info('Decrypting & downloading evidence from vault...');
      const endpoint = item.media_url.startsWith('/api') ? item.media_url.slice(4) : item.media_url;
      const downloadEndpoint = `${endpoint}${endpoint.includes('?') ? '&' : '?'}download=true`;
      const response = await api.get(downloadEndpoint, { responseType: 'blob' });
      const mime = item.media_type || response.headers['content-type'] || 'application/octet-stream';
      const blob = new Blob([response.data], { type: mime });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      let downloadName = item.original_name || item.file_name;
      if (!downloadName) {
        const ext = mime.includes('video') ? 'mp4' : (mime.includes('png') ? 'png' : (mime.includes('webp') ? 'webp' : 'jpg'));
        downloadName = `Nivara_Evidence_${item.id.slice(0, 8)}.${ext}`;
      }
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`Evidence downloaded: ${downloadName}`);
    } catch (err) {
      console.error('Evidence download failed:', err);
      let msg = 'Failed to retrieve media file';
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          if (parsed.detail) msg = parsed.detail;
        } catch (_) {}
      } else if (err.response?.data?.detail) {
        msg = err.response.data.detail;
      }
      toast.error(msg);
    }
  };

  const handlePreviewMedia = async (item) => {
    if (!item.media_url) return;
    try {
      if (previewMedia?.url) {
        URL.revokeObjectURL(previewMedia.url);
      }
      const endpoint = item.media_url.startsWith('/api') ? item.media_url.slice(4) : item.media_url;
      const response = await api.get(endpoint, { responseType: 'blob' });
      const mime = item.media_type || response.headers['content-type'] || 'image/jpeg';
      const blob = new Blob([response.data], { type: mime });
      const url = URL.createObjectURL(blob);
      setPreviewMedia({
        url,
        type: mime,
        title: item.title,
        hash: item.hash,
        original_name: item.original_name || item.file_name,
        item,
      });
    } catch (err) {
      console.error('Evidence preview failed:', err);
      let msg = 'Failed to load media preview';
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          if (parsed.detail) msg = parsed.detail;
        } catch (_) {}
      } else if (err.response?.data?.detail) {
        msg = err.response.data.detail;
      }
      toast.error(msg);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleConfirmShare = async () => {
    if (!selectedEvidenceToShare || !targetCaseId) return;
    setIsSharing(true);
    try {
      const { data } = await api.post(`/evidence/${selectedEvidenceToShare.id}/share`, {
        case_id: targetCaseId
      });
      toast.success(data.message || 'Evidence shared with authorized officer successfully');
      setShowShareModal(false);
      setSelectedEvidenceToShare(null);
      loadEvidence();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to share evidence with officer');
    } finally {
      setIsSharing(false);
    }
  };

  const handleConfirmRevoke = async () => {
    if (!selectedEvidenceToRevoke) return;
    setIsRevoking(true);
    try {
      const { data } = await api.post(`/evidence/${selectedEvidenceToRevoke.id}/revoke`);
      toast.success(data.message || 'Evidence access revoked successfully');
      setShowRevokeModal(false);
      setSelectedEvidenceToRevoke(null);
      loadEvidence();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to revoke evidence access');
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="max-w-2xl w-full bg-slate-900 border border-slate-700/80 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex justify-between items-center pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-white">Stealth Encrypted Evidence Vault</h2>
              <p className="text-xs text-slate-400">SHA-256 Tamper-Proof Cryptographic Incident & Media Preservation</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Toggle: Text Snapshot vs Media File */}
        <div className="mt-3 flex items-center gap-2 p-1 bg-slate-950/80 border border-slate-800 rounded-2xl text-xs font-semibold">
          <button
            onClick={() => setMode('text')}
            className={`flex-1 py-1.5 rounded-xl transition flex items-center justify-center gap-1.5 ${
              mode === 'text'
                ? 'bg-cyan-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Camera className="w-3.5 h-3.5" /> Text Incident Snapshot
          </button>
          <button
            onClick={() => setMode('media')}
            className={`flex-1 py-1.5 rounded-xl transition flex items-center justify-center gap-1.5 ${
              mode === 'media'
                ? 'bg-cyan-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" /> Photo & Video Upload
          </button>
        </div>

        {/* Form Container */}
        {mode === 'text' ? (
          <div className="my-3 p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between text-xs text-cyan-300 font-semibold">
              <span className="flex items-center gap-1.5"><Camera className="w-4 h-4" /> Log Incident / Threat Details</span>
              <span className="text-[10px] text-slate-500 font-mono">AES-256 ENCRYPTED</span>
            </div>

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Incident Title (e.g. Threat Message, Stalker Sighting at 9:00 PM)"
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-cyan-500"
            />

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Detailed description, sender info, vehicle details, or exact quotes..."
              rows={2}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-cyan-500"
            />

            <button
              onClick={handleCaptureSnapshot}
              disabled={uploading}
              className="w-full py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow transition disabled:opacity-50"
            >
              <Shield className="w-4 h-4" /> Seal & Encrypt Snapshot to Vault
            </button>
          </div>
        ) : (
          <div className="my-3 p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between text-xs text-cyan-300 font-semibold">
              <span className="flex items-center gap-1.5"><Upload className="w-4 h-4" /> Upload Visual Evidence (Images / Videos)</span>
              <span className="text-[10px] text-slate-500 font-mono">MAX 25MB · SHA-256</span>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setSelectedFile(file);
                  if (!title) setTitle(file.name);
                }
              }}
              className="hidden"
              id="vault-file-input"
            />

            <label
              htmlFor="vault-file-input"
              className="w-full border border-dashed border-slate-700 hover:border-cyan-500/60 rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer bg-slate-900/50 hover:bg-slate-900 transition"
            >
              {selectedFile ? (
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 text-xs text-cyan-300 font-semibold">
                    {selectedFile.type?.startsWith('video') ? <Film className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                    <span>{selectedFile.name}</span>
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    {formatFileSize(selectedFile.size)} · Click to change file
                  </span>
                </div>
              ) : (
                <div className="text-center py-1">
                  <Upload className="w-5 h-5 text-slate-500 mx-auto mb-1" />
                  <span className="text-xs text-slate-300 font-medium">Click to select photo or video</span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">JPEG, PNG, WEBP, MP4, WEBM, MOV (Up to 25MB)</span>
                </div>
              )}
            </label>

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Evidence Title / Caption"
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-cyan-500"
            />

            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional notes: context, where taken, date/time..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-cyan-500"
            />

            <button
              onClick={handleUploadFile}
              disabled={uploading || !selectedFile}
              className="w-full py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow transition disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Encrypting & Hashing Media...</span>
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  <span>Seal & Encrypt Media to Vault</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* List of Sealed Evidence */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[160px]">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
            <span>Sealed Vault Records ({evidenceList.length})</span>
            <button onClick={() => loadEvidence()} className="text-slate-500 hover:text-slate-300 flex items-center gap-1 font-normal text-[11px]">
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>

          {evidenceList.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">
              No evidence logged yet. Use the form above to preserve tamper-proof records.
            </div>
          ) : (
            evidenceList.map((item, idx) => (
              <div key={idx} className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    {item.is_media ? (
                      item.media_type?.includes('video') ? (
                        <Film className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                      ) : (
                        <ImageIcon className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      )
                    ) : (
                      <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    )}
                    <span className="font-bold text-xs text-slate-200">{item.title}</span>
                    {item.is_media && item.file_size && (
                      <span className="text-[10px] text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-1.5 py-0.2 rounded">
                        {formatFileSize(item.file_size)}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {new Date(item.timestamp).toLocaleString()}
                  </span>
                </div>

                {item.notes && <p className="text-xs text-slate-400">{item.notes}</p>}

                {/* Status & Integrity Row */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-slate-800/60">
                  <div className="flex items-center gap-2">
                    {item.sharing_status === 'shared' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <ShieldCheck className="w-3 h-3" /> Shared with {item.shared_officer_name || 'Assigned Officer'}
                      </span>
                    ) : item.sharing_status === 'revoked' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        <ShieldAlert className="w-3 h-3" /> Sharing Revoked
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800/80 text-slate-400 border border-slate-700">
                        <Lock className="w-3 h-3" /> Private (Vault Only)
                      </span>
                    )}
                  </div>

                  <div className="font-mono text-cyan-400 flex items-center gap-1 text-[10px]">
                    <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className="truncate max-w-[180px] sm:max-w-[240px]" title={item.hash}>{item.hash}</span>
                  </div>
                </div>

                {/* Action Buttons Row */}
                <div className="flex items-center justify-end gap-2 pt-1 text-[10px]">
                  {item.is_media && item.media_url && (
                    <>
                      <button
                        onClick={() => handlePreviewMedia(item)}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold flex items-center gap-1 transition"
                      >
                        <Eye className="w-3 h-3" /> Preview
                      </button>
                      <button
                        onClick={() => handleDownloadMedia(item)}
                        className="px-2 py-0.5 rounded bg-cyan-950 hover:bg-cyan-900 border border-cyan-700 text-cyan-200 font-semibold flex items-center gap-1 transition"
                      >
                        <Download className="w-3 h-3" /> Download
                      </button>
                    </>
                  )}

                  {item.sharing_status === 'shared' ? (
                    <button
                      onClick={() => {
                        setSelectedEvidenceToRevoke(item);
                        setShowRevokeModal(true);
                      }}
                      className="px-2 py-0.5 rounded bg-rose-950/70 hover:bg-rose-900 border border-rose-800/80 text-rose-300 font-semibold flex items-center gap-1 transition"
                      title="Revoke officer access to this record"
                    >
                      <ShieldAlert className="w-3 h-3" /> Revoke Access
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setSelectedEvidenceToShare(item);
                        setShowShareModal(true);
                      }}
                      className="px-2 py-0.5 rounded bg-blue-950/80 hover:bg-blue-900 border border-blue-700/80 text-blue-300 font-semibold flex items-center gap-1 transition"
                      title="Share this evidence record with an authorized officer"
                    >
                      <Share2 className="w-3 h-3" /> Share with Officer
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Share with Officer Modal Dialog */}
        {showShareModal && selectedEvidenceToShare && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-slate-900 border border-blue-500/40 rounded-3xl p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
                  <Share2 className="w-4 h-4" /> Share Evidence with Assigned Officer
                </div>
                <button
                  onClick={() => { setShowShareModal(false); setSelectedEvidenceToShare(null); }}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Selected Item Overview */}
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-1 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-200">{selectedEvidenceToShare.title}</span>
                  <span className="text-[10px] text-cyan-400 font-mono">
                    {selectedEvidenceToShare.is_media ? (selectedEvidenceToShare.media_type || 'Media File') : 'Text Snapshot'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono truncate">
                  Record ID: {selectedEvidenceToShare.id}
                </div>
                <div className="text-[10px] text-emerald-400 font-mono truncate">
                  {selectedEvidenceToShare.hash}
                </div>
              </div>

              {/* Case Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Select Associated SOS Case:
                </label>
                {cases.length === 0 ? (
                  <p className="text-xs text-amber-400">No active cases found for your account.</p>
                ) : (
                  <select
                    value={targetCaseId}
                    onChange={(e) => setTargetCaseId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
                  >
                    {cases.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title} ({c.priority === 'emergency' ? '🚨 EMERGENCY' : c.status}) - ID: {c.id.slice(0, 8)}...
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Officer Status for Selected Case */}
              {(() => {
                const currentCase = cases.find((c) => c.id === targetCaseId) || cases[0];
                const hasOfficer = Boolean(currentCase?.officer_id || currentCase?.acknowledged_by);
                const officerName = currentCase?.acknowledged_by || (currentCase?.officer_id ? `Assigned Officer (${currentCase.officer_id.slice(0, 8)})` : null);

                return (
                  <div className="space-y-3">
                    {hasOfficer ? (
                      <div className="p-3 bg-emerald-950/30 border border-emerald-700/40 rounded-2xl text-xs space-y-1">
                        <div className="flex items-center gap-1.5 text-emerald-300 font-bold">
                          <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>Intended Recipient: {officerName || 'Duty Officer'}</span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                          Confirming will grant this assigned officer authorized access to examine and verify this specific evidence record in their Live Response Center.
                        </p>
                      </div>
                    ) : (
                      <div className="p-3 bg-amber-950/30 border border-amber-700/50 rounded-2xl text-xs space-y-1">
                        <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>No Officer Assigned Yet</span>
                        </div>
                        <p className="text-[11px] text-amber-200/90 leading-relaxed">
                          This case has not been claimed by a duty officer yet. Evidence cannot be sent to an unassigned case or arbitrary officer. Please select another case or wait for duty assignment.
                        </p>
                      </div>
                    )}

                    <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-[11px] text-slate-400 leading-normal">
                      🔒 <b>Stealth Vault Security:</b> Only this individual record will be shared. The rest of your private vault remains strictly confidential, encrypted, and undisclosed.
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                      <button
                        onClick={() => { setShowShareModal(false); setSelectedEvidenceToShare(null); }}
                        className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleConfirmShare}
                        disabled={!hasOfficer || isSharing}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 transition flex items-center gap-1.5"
                      >
                        {isSharing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                        <span>{hasOfficer ? 'Confirm & Share with Officer' : 'Awaiting Officer Assignment'}</span>
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Revoke Sharing Confirmation Dialog */}
        {showRevokeModal && selectedEvidenceToRevoke && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-slate-900 border border-rose-500/40 rounded-3xl p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                  <ShieldAlert className="w-4 h-4" /> Revoke Evidence Access
                </div>
                <button
                  onClick={() => { setShowRevokeModal(false); setSelectedEvidenceToRevoke(null); }}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-slate-300">
                <p>
                  Are you sure you want to revoke officer access to <span className="font-bold text-white">"{selectedEvidenceToRevoke.title}"</span>?
                </p>
                <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-2xl text-[11px] text-amber-300 space-y-1.5 leading-relaxed">
                  <p className="font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Revocation Terms:
                  </p>
                  <p>
                    Revoking access immediately enforces a 403 Forbidden on future officer requests to view or download this evidence record.
                  </p>
                  <p className="text-amber-200/80">
                    *Note: If the recipient already downloaded or saved a copy locally, revocation cannot delete files already outside the platform.*
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  onClick={() => { setShowRevokeModal(false); setSelectedEvidenceToRevoke(null); }}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmRevoke}
                  disabled={isRevoking}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-40 transition flex items-center gap-1.5"
                >
                  {isRevoking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                  <span>Confirm Revoke Access</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Victim Media Preview Modal */}
        {previewMedia && (
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="max-w-2xl w-full bg-slate-900 border border-slate-700 rounded-3xl p-5 shadow-2xl flex flex-col max-h-[85vh]">
              <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xs text-white">{previewMedia.title}</h3>
                    {previewMedia.original_name && (
                      <p className="text-[10px] text-slate-400 font-mono">File: {previewMedia.original_name}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {previewMedia.item && (
                    <button
                      onClick={() => handleDownloadMedia(previewMedia.item)}
                      className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-semibold rounded-lg flex items-center gap-1 shadow"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (previewMedia.url) URL.revokeObjectURL(previewMedia.url);
                      setPreviewMedia(null);
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto py-4 flex flex-col items-center justify-center">
                {previewMedia.type?.startsWith('video') ? (
                  <video src={previewMedia.url} controls playsInline className="max-h-[55vh] max-w-full rounded-2xl border border-slate-800" />
                ) : (
                  <img src={previewMedia.url} alt="Vault Media Evidence" className="max-h-[55vh] max-w-full object-contain rounded-2xl border border-slate-800 bg-black/40" />
                )}
              </div>

              <div className="pt-3 border-t border-slate-800 text-[10px] flex items-center justify-between">
                <span className="font-mono text-cyan-400 truncate max-w-[400px]">SHA-256: {previewMedia.hash}</span>
                <button
                  onClick={() => {
                    if (previewMedia.url) URL.revokeObjectURL(previewMedia.url);
                    setPreviewMedia(null);
                  }}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-semibold text-xs"
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl">
            Close Vault
          </button>
        </div>
      </div>
    </div>
  );
}
