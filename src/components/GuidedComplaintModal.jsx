import React, { useState } from 'react';
import { 
  FileText, Shield, AlertCircle, CheckCircle2, ChevronRight, ChevronLeft, 
  MapPin, Calendar, Clock, User, X, Lock, Check
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { getUserLocation } from '@/lib/location';

const INCIDENT_CATEGORIES = [
  { id: 'harassment', label: 'Verbal / Street Harassment', desc: 'Catcalling, stalking, verbal abuse or intimidation in public or workplace' },
  { id: 'stalking', label: 'Persistent Stalking', desc: 'Following, watching, or tracking physical movement' },
  { id: 'domestic_abuse', label: 'Domestic Violence / Threat', desc: 'Physical or emotional violence at home or by a partner/family' },
  { id: 'cyber_threat', label: 'Cyberbullying / Blackmail', desc: 'Non-consensual media sharing, online harassment, or extortion' },
  { id: 'assault', label: 'Physical Assault / Battery', desc: 'Direct physical attack, battery, or bodily harm' },
  { id: 'other', label: 'Other Safety Concern', desc: 'Any other critical safety threat or incident requiring formal filing' }
];

export default function GuidedComplaintModal({ onClose, onComplaintLodged, initialDescription = '' }) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [successResult, setSuccessResult] = useState(null);

  // Form Fields
  const [category, setCategory] = useState('harassment');
  const [title, setTitle] = useState('');
  const [incidentDate, setIncidentDate] = useState(new Date().toISOString().split('T')[0]);
  const [incidentLocation, setIncidentLocation] = useState('');
  const [suspectDetails, setSuspectDetails] = useState('');
  const [description, setDescription] = useState(initialDescription || '');
  const [priority, setPriority] = useState('standard'); // 'standard' | 'high'
  const [coords, setCoords] = useState({ latitude: null, longitude: null });
  const [acquiringLoc, setAcquiringLoc] = useState(false);

  const handleAcquireLocation = async () => {
    setAcquiringLoc(true);
    try {
      const loc = await getUserLocation();
      if (loc && loc.has_location && loc.latitude != null && loc.longitude != null) {
        setCoords({ latitude: loc.latitude, longitude: loc.longitude });
        setIncidentLocation((prev) => prev ? `${prev} (GPS: ${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)})` : `GPS: ${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`);
        toast.success('Live GPS coordinates attached to complaint');
      } else {
        toast.warning('GPS unavailable. You can enter the location text manually.');
      }
    } catch {
      toast.warning('Could not acquire location. Please enter location manually.');
    } finally {
      setAcquiringLoc(false);
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!description.trim()) {
      return toast.error('Please provide incident details or description.');
    }
    setSubmitting(true);
    try {
      const payload = {
        category,
        title: title.trim() || `${category.replace('_', ' ').toUpperCase()} Incident`,
        description: description.trim(),
        incident_date: incidentDate,
        incident_location: incidentLocation.trim() || 'Undisclosed Location',
        suspect_details: suspectDetails.trim() || 'Unknown or not specified',
        priority,
        latitude: coords.latitude,
        longitude: coords.longitude,
      };

      const { data } = await api.post('/complaints', payload);
      setSuccessResult(data);
      toast.success('Official complaint lodged successfully');
      if (onComplaintLodged) onComplaintLodged(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to submit complaint. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="max-w-2xl w-full bg-slate-900 border border-slate-700 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/40 flex items-center justify-center text-violet-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-white">Guided Incident & Complaint Filing</h2>
              <p className="text-xs text-slate-400">Step-by-step verified legal and duty-officer incident intake</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Progress Bar */}
        {!successResult && (
          <div className="my-3">
            <div className="flex justify-between text-[11px] font-semibold text-slate-400 mb-1.5 px-1">
              <span className={step >= 1 ? 'text-violet-400' : ''}>1. Category</span>
              <span className={step >= 2 ? 'text-violet-400' : ''}>2. When & Where</span>
              <span className={step >= 3 ? 'text-violet-400' : ''}>3. Incident Details</span>
              <span className={step >= 4 ? 'text-violet-400' : ''}>4. Review & Submit</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-violet-500 h-full transition-all duration-300"
                style={{ width: `${(step / 4) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Step Contents */}
        <div className="flex-1 overflow-y-auto py-2 pr-1 space-y-4">
          {successResult ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Official Complaint Registered</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Your incident has been securely preserved and routed to the assigned duty officer pool.
                </p>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 max-w-md mx-auto text-left space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Reference Number:</span>
                  <span className="font-mono font-bold text-violet-300">{successResult.reference_number}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Case ID:</span>
                  <span className="font-mono text-slate-300 text-[11px]">{successResult.case_id}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Status:</span>
                  <span className="text-emerald-400 font-semibold uppercase">{successResult.status}</span>
                </div>
              </div>

              <div className="pt-2 flex justify-center gap-3">
                <button
                  onClick={onClose}
                  className="px-6 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-bold transition shadow"
                >
                  Done
                </button>
              </div>
            </div>
          ) : step === 1 ? (
            /* STEP 1: CATEGORY SELECTION */
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-300">
                Select the incident category that best describes your situation:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {INCIDENT_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                      category === cat.id
                        ? 'bg-violet-950/60 border-violet-500 text-white shadow-md'
                        : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">{cat.label}</span>
                      {category === cat.id && <Check className="w-4 h-4 text-violet-400" />}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">{cat.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : step === 2 ? (
            /* STEP 2: WHEN & WHERE */
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-300">
                Specify when and where the incident took place:
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-400 flex items-center gap-1 font-semibold">
                  <Calendar className="w-3.5 h-3.5 text-violet-400" /> Date of Incident:
                </label>
                <input
                  type="date"
                  value={incidentDate}
                  onChange={(e) => setIncidentDate(e.target.value)}
                  className="w-full bg-slate-950/90 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-violet-500"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] text-slate-400 flex items-center gap-1 font-semibold">
                    <MapPin className="w-3.5 h-3.5 text-violet-400" /> Location / Address / Landmark:
                  </label>
                  <button
                    type="button"
                    onClick={handleAcquireLocation}
                    disabled={acquiringLoc}
                    className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1 font-semibold"
                  >
                    {acquiringLoc ? 'Acquiring...' : 'Use Current GPS'}
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="e.g. Near Indiranagar Metro Station or 100ft Road Corridor"
                  value={incidentLocation}
                  onChange={(e) => setIncidentLocation(e.target.value)}
                  className="w-full bg-slate-950/90 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-violet-500"
                />
              </div>
            </div>
          ) : step === 3 ? (
            /* STEP 3: DETAILS & SUSPECT */
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-300">
                Provide details about what occurred:
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-400 font-semibold">Complaint Title / Summary:</label>
                <input
                  type="text"
                  placeholder="e.g. Repeated stalking near office entrance"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-950/90 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-violet-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-400 font-semibold">Full Narrative / Description:</label>
                <textarea
                  rows={4}
                  placeholder="Describe what happened clearly: words spoken, vehicle numbers, timeline, witnesses..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-950/90 border border-slate-800 rounded-xl p-3 text-xs text-white outline-none focus:border-violet-500 leading-relaxed"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-400 flex items-center gap-1 font-semibold">
                  <User className="w-3.5 h-3.5 text-violet-400" /> Suspect / Person Involved Details (if known/safe):
                </label>
                <input
                  type="text"
                  placeholder="Name, physical description, vehicle model/number, relationship if applicable"
                  value={suspectDetails}
                  onChange={(e) => setSuspectDetails(e.target.value)}
                  className="w-full bg-slate-950/90 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-violet-500"
                />
                <span className="text-[10px] text-slate-500">Encrypted at rest with AES-256 for privacy protection.</span>
              </div>
            </div>
          ) : (
            /* STEP 4: REVIEW & PRIORITY */
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-300">
                Review your complaint before formal submission:
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between border-b border-slate-800 pb-1.5">
                  <span className="text-slate-400">Category:</span>
                  <span className="text-white font-semibold uppercase">{category.replace('_', ' ')}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-1.5">
                  <span className="text-slate-400">Date & Location:</span>
                  <span className="text-white font-medium">{incidentDate} • {incidentLocation || 'Not specified'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Narrative:</span>
                  <p className="text-slate-200 bg-slate-900/80 p-2 rounded-xl text-[11px] max-h-24 overflow-y-auto">
                    {description || 'No description provided.'}
                  </p>
                </div>
              </div>

              {/* Priority Selector */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-300">Filing Urgency Priority:</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPriority('standard')}
                    className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold transition ${
                      priority === 'standard'
                        ? 'bg-blue-600/30 border-blue-500 text-blue-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    Standard Investigation
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriority('high')}
                    className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold transition ${
                      priority === 'high'
                        ? 'bg-amber-600/30 border-amber-500 text-amber-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    High Urgency Review
                  </button>
                </div>
              </div>

              {/* Notice */}
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
                <Shield className="w-4 h-4 text-violet-400 flex-shrink-0" />
                <span>
                  This filing creates a formal record in your NIVARA case ledger. For active life-threatening danger, dial <strong>112</strong> immediately.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        {!successResult && (
          <div className="pt-3 border-t border-slate-800 flex justify-between items-center">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl flex items-center gap-1 transition"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-semibold rounded-xl transition"
              >
                Cancel
              </button>
            )}

            {step < 4 ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 3 && !description.trim()) {
                    return toast.error('Please describe what occurred in the narrative field.');
                  }
                  setStep((s) => s + 1);
                }}
                className="px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow transition"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting || !description.trim()}
                onClick={handleSubmit}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow transition disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                {submitting ? 'Lodging Complaint...' : 'Submit Official Complaint'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
