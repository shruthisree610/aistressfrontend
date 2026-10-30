import React, { useEffect, useState } from 'react';
import { 
  ShieldCheck, CheckSquare, Square, Download, Sparkles, X, 
  AlertCircle, Plus, Phone, MapPin, FileText, Check, RefreshCw, Trash2, HeartHandshake,
  ExternalLink, Navigation, Radio, Key, Lock, Eye, EyeOff, Send, AlertTriangle, ShieldAlert, Bell, CheckCircle2
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { getUserLocation } from '@/lib/location';

export default function AISafetyPlanModal({ caseId, onClose }) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completedSteps, setCompletedSteps] = useState({});
  const [activeTab, setActiveTab] = useState('checklist'); // 'checklist' | 'contacts' | 'places' | 'notes'
  
  // Custom step state
  const [showAddStep, setShowAddStep] = useState(false);
  const [newStepTitle, setNewStepTitle] = useState('');
  const [newStepCategory, setNewStepCategory] = useState('Personal');
  const [newStepDesc, setNewStepDesc] = useState('');
  
  // Contacts & Places & Notes state
  const [contacts, setContacts] = useState([]);
  const [safePlaces, setSafePlaces] = useState([]);
  const [emergencyNotes, setEmergencyNotes] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactCodeWord, setNewContactCodeWord] = useState('');
  const [newPlaceName, setNewPlaceName] = useState('');
  const [newPlaceAddress, setNewPlaceAddress] = useState('');

  // Duress Secret Code & Emergency Alert State
  const [secretCode, setSecretCode] = useState('');
  const [alertMessageTemplate, setAlertMessageTemplate] = useState('');
  const [alertIncludeLocation, setAlertIncludeLocation] = useState(true);
  const [lastAlertSentAt, setLastAlertSentAt] = useState(null);
  const [showSecretCode, setShowSecretCode] = useState(false);
  const [isSavingSecretCode, setIsSavingSecretCode] = useState(false);

  // Dispatch Confirmation & Provider Status Dialog State
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [dispatchSecretCodeInput, setDispatchSecretCodeInput] = useState('');
  const [isDispatchingAlert, setIsDispatchingAlert] = useState(false);
  const [alertResult, setAlertResult] = useState(null);

  // Verified Nearby Havens Integration (Real Location)
  const [nearbyHavens, setNearbyHavens] = useState([]);
  const [loadingHavens, setLoadingHavens] = useState(false);

  useEffect(() => {
    loadOrGeneratePlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  useEffect(() => {
    if (activeTab === 'places' && nearbyHavens.length === 0) {
      loadNearbySafeHavens();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const loadNearbySafeHavens = async () => {
    setLoadingHavens(true);
    try {
      const loc = await getUserLocation();
      let url = '/safe-havens?provider=osc_directory';
      if (loc && loc.has_location && loc.latitude != null && loc.longitude != null) {
        url += `&lat=${loc.latitude}&lng=${loc.longitude}`;
      }
      const { data } = await api.get(url);
      setNearbyHavens(data.havens?.slice(0, 6) || []);
    } catch (e) {
      console.warn('Failed to load nearby safe havens:', e);
    } finally {
      setLoadingHavens(false);
    }
  };

  const loadOrGeneratePlan = async () => {
    setLoading(true);
    try {
      // 1. First attempt to load existing saved plan
      const res = await api.get('/safety-plan', { params: { case_id: caseId } });
      if (res.data && res.data._id) {
        initPlanData(res.data);
      } else {
        // 2. If no plan exists, generate initial plan
        await handleGeneratePlan();
      }
    } catch (err) {
      console.warn('Initial safety plan load error, generating new:', err);
      await handleGeneratePlan();
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePlan = async () => {
    try {
      setLoading(true);
      const { data } = await api.post('/safety-plan/generate', { case_id: caseId });
      initPlanData(data);
      toast.success('Personalized safety plan synthesized and saved');
    } catch (e) {
      toast.error('Could not generate safety plan. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const initPlanData = (data) => {
    setPlan(data);
    const init = {};
    data.steps?.forEach((s) => {
      init[s.id] = Boolean(s.completed);
    });
    setCompletedSteps(init);
    setContacts(data.trusted_contacts || []);
    setSafePlaces(data.safe_places || []);
    setEmergencyNotes(data.emergency_notes || '');
    setSecretCode(data.secret_code || '');
    setAlertMessageTemplate(data.alert_message_template || '');
    setAlertIncludeLocation(data.alert_include_location !== undefined ? Boolean(data.alert_include_location) : true);
    setLastAlertSentAt(data.last_alert_sent_at || null);
  };

  const handleSaveSecretCode = async (e) => {
    if (e) e.preventDefault();
    if (!plan) return;
    setIsSavingSecretCode(true);
    setSaving(true);
    try {
      const planId = plan._id || plan.id;
      const { data } = await api.put(`/safety-plan/${planId}`, {
        secret_code: secretCode.trim(),
        alert_message_template: alertMessageTemplate.trim(),
        alert_include_location: alertIncludeLocation
      });
      initPlanData(data);
      toast.success('Duress secret code and alert settings encrypted & saved');
    } catch (err) {
      toast.error('Failed to save secret code: ' + (err.response?.data?.detail || err.message));
    } finally {
      setIsSavingSecretCode(false);
      setSaving(false);
    }
  };

  const handleTriggerEmergencyAlert = async (e) => {
    if (e) e.preventDefault();
    if (!dispatchSecretCodeInput.trim()) {
      toast.error('Please enter your Secret Duress Code to dispatch the alert.');
      return;
    }
    setIsDispatchingAlert(true);
    setAlertResult(null);
    try {
      let coords = null;
      if (alertIncludeLocation) {
        try {
          const loc = await getUserLocation({ timeout: 6000, enableHighAccuracy: true });
          if (loc && loc.has_location) {
            coords = loc;
          }
        } catch (e) {
          console.warn('GPS capture for alert skipped or unavailable:', e);
        }
      }

      const planId = plan._id || plan.id;
      const res = await api.post(`/safety-plan/${planId}/alert`, {
        secret_code: dispatchSecretCodeInput.trim(),
        custom_message: alertMessageTemplate.trim() || undefined,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        location_label: coords?.location_label
      });

      const data = res.data;
      setAlertResult(data);

      if (data.ok) {
        toast.success(`🚨 Emergency alert dispatched to ${data.contacts_notified} trusted contact(s) via ${data.provider}!`);
        setShowDispatchModal(false);
        setDispatchSecretCodeInput('');
      } else {
        // Fallback guidance and dialer links are rendered directly inside the modal
      }
    } catch (err) {
      const errDetail = err.response?.data?.detail || err.message;
      toast.error(errDetail || 'Failed to dispatch alert');
    } finally {
      setIsDispatchingAlert(false);
    }
  };

  const toggleStep = async (stepId) => {
    if (!plan) return;
    const currentVal = Boolean(completedSteps[stepId]);
    const nextVal = !currentVal;

    // Optimistic UI update
    setCompletedSteps((prev) => ({ ...prev, [stepId]: nextVal }));
    setSaving(true);

    try {
      const planId = plan._id || plan.id;
      await api.patch(`/safety-plan/${planId}/step/${stepId}`, { completed: nextVal });
      
      // Update local plan object
      setPlan((prev) => {
        if (!prev) return prev;
        const updatedSteps = (prev.steps || []).map((s) =>
          s.id === stepId ? { ...s, completed: nextVal } : s
        );
        return { ...prev, steps: updatedSteps };
      });
    } catch (err) {
      // Revert on failure
      setCompletedSteps((prev) => ({ ...prev, [stepId]: currentVal }));
      toast.error('Failed to save step progress to server');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCustomStep = async (e) => {
    e.preventDefault();
    if (!newStepTitle.trim() || !plan) return;

    const newStep = {
      id: `step-custom-${Date.now()}`,
      category: newStepCategory || 'Personal',
      title: newStepTitle.trim(),
      desc: newStepDesc.trim() || 'Custom personal safety protocol.',
      completed: false,
      priority: 'High',
      is_custom: true,
    };

    const updatedSteps = [...(plan.steps || []), newStep];
    setSaving(true);
    try {
      const planId = plan._id || plan.id;
      const { data } = await api.put(`/safety-plan/${planId}`, { steps: updatedSteps });
      initPlanData(data);
      setNewStepTitle('');
      setNewStepDesc('');
      setShowAddStep(false);
      toast.success('Custom action added and saved');
    } catch (err) {
      toast.error('Failed to add custom step');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStep = async (stepId) => {
    if (!plan) return;
    const updatedSteps = (plan.steps || []).filter((s) => s.id !== stepId);
    setSaving(true);
    try {
      const planId = plan._id || plan.id;
      const { data } = await api.put(`/safety-plan/${planId}`, { steps: updatedSteps });
      initPlanData(data);
      toast.success('Step removed');
    } catch (err) {
      toast.error('Failed to remove step');
    } finally {
      setSaving(false);
    }
  };

  const handleAddContact = async (e) => {
    e.preventDefault();
    if (!newContactName.trim() || !newContactPhone.trim() || !plan) return;

    const newContact = {
      name: newContactName.trim(),
      phone: newContactPhone.trim(),
      code_word: newContactCodeWord.trim() || 'Pineapple',
      relationship: 'Trusted Contact'
    };

    const updated = [...contacts, newContact];
    setSaving(true);
    try {
      const planId = plan._id || plan.id;
      const { data } = await api.put(`/safety-plan/${planId}`, { trusted_contacts: updated });
      initPlanData(data);
      setNewContactName('');
      setNewContactPhone('');
      setNewContactCodeWord('');
      toast.success('Trusted emergency contact added');
    } catch (err) {
      toast.error('Failed to save contact');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteContact = async (idx) => {
    const updated = contacts.filter((_, i) => i !== idx);
    setSaving(true);
    try {
      const planId = plan._id || plan.id;
      const { data } = await api.put(`/safety-plan/${planId}`, { trusted_contacts: updated });
      initPlanData(data);
      toast.success('Contact removed');
    } catch (err) {
      toast.error('Failed to remove contact');
    } finally {
      setSaving(false);
    }
  };

  const handleAddPlace = async (e) => {
    e.preventDefault();
    if (!newPlaceName.trim() || !plan) return;

    const newPlace = {
      name: newPlaceName.trim(),
      address: newPlaceAddress.trim() || 'Undisclosed safe location',
      transport_route: 'Direct route or public transit',
      notes: 'Accessible 24/7'
    };

    const updated = [...safePlaces, newPlace];
    setSaving(true);
    try {
      const planId = plan._id || plan.id;
      const { data } = await api.put(`/safety-plan/${planId}`, { safe_places: updated });
      initPlanData(data);
      setNewPlaceName('');
      setNewPlaceAddress('');
      toast.success('Safe haven location saved');
    } catch (err) {
      toast.error('Failed to save safe place');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePlace = async (idx) => {
    const updated = safePlaces.filter((_, i) => i !== idx);
    setSaving(true);
    try {
      const planId = plan._id || plan.id;
      const { data } = await api.put(`/safety-plan/${planId}`, { safe_places: updated });
      initPlanData(data);
      toast.success('Safe place removed');
    } catch (err) {
      toast.error('Failed to remove location');
    } finally {
      setSaving(false);
    }
  };

  const handleAddHavenToSafePlaces = async (haven) => {
    if (!plan) return;
    const alreadyExists = safePlaces.some((p) => p.name.toLowerCase() === haven.name.toLowerCase());
    if (alreadyExists) {
      toast.info('This safe haven is already in your designated places.');
      return;
    }

    const newPlace = {
      name: haven.name,
      address: haven.address || 'Government One Stop Crisis Facility',
      transport_route: haven.distance_km != null ? `Approx. ${haven.distance_km} km away` : 'Direct route',
      notes: haven.phone ? `Helpline: ${haven.phone}` : 'Verified 24/7 Haven'
    };

    const updated = [...safePlaces, newPlace];
    setSaving(true);
    try {
      const planId = plan._id || plan.id;
      const { data } = await api.put(`/safety-plan/${planId}`, { safe_places: updated });
      initPlanData(data);
      toast.success(`"${haven.name}" saved to your safe places`);
    } catch (err) {
      toast.error('Failed to save safe haven location');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      const planId = plan._id || plan.id;
      const { data } = await api.put(`/safety-plan/${planId}`, { emergency_notes: emergencyNotes });
      initPlanData(data);
      toast.success('Emergency notes saved to vault');
    } catch (err) {
      toast.error('Failed to save emergency notes');
    } finally {
      setSaving(false);
    }
  };

  const downloadPlan = () => {
    if (!plan) return;
    const completedCount = Object.values(completedSteps).filter(Boolean).length;
    const totalCount = plan.steps?.length || 0;

    const content = 
      `====================================================\n` +
      `NIVARA PERSONAL SAFETY & EMERGENCY ACTION PLAN\n` +
      `====================================================\n\n` +
      `Protected Individual: ${plan.victim_name || 'Protected User'}\n` +
      `Assessed Risk Level: ${plan.risk_category || 'Moderate'}\n` +
      `Progress: ${completedCount} of ${totalCount} actions secured\n` +
      `Last Updated: ${new Date(plan.updated_at || Date.now()).toLocaleString()}\n\n` +
      `DISCLAIMER:\n` +
      `This plan is a confidential personal safety planning guide.\n` +
      `NIVARA does not automatically dispatch external emergency services.\n` +
      `In an immediate life-threatening emergency, call 112 directly.\n\n` +
      `----------------------------------------------------\n` +
      `1. ACTION STEPS & PROTOCOLS\n` +
      `----------------------------------------------------\n` +
      (plan.steps || []).map((s, idx) => 
        `[${completedSteps[s.id] ? 'COMPLETED' : 'PENDING'}] Action ${idx + 1}: ${s.title} (${s.priority || 'High'} Priority)\n` +
        `Category: ${s.category}\n` +
        `Details: ${s.desc}\n`
      ).join('\n') +
      `\n\n----------------------------------------------------\n` +
      `2. TRUSTED CONTACTS & DURESS EMERGENCY PROTOCOL\n` +
      `----------------------------------------------------\n` +
      `Duress Secret Safe-Word: ${secretCode ? '[Configured & Encrypted at Rest]' : 'Not configured'}\n` +
      `Alert Message Template: ${alertMessageTemplate || 'Default Emergency Protocol'}\n` +
      `GPS Coordinates Sharing: ${alertIncludeLocation ? 'Enabled' : 'Disabled'}\n` +
      `Last Alert Dispatched: ${lastAlertSentAt ? new Date(lastAlertSentAt).toLocaleString() : 'None'}\n\n` +
      `Trusted Contacts:\n` +
      (contacts.length > 0 
        ? contacts.map((c, i) => `${i + 1}. ${c.name} (${c.phone}) — Code Word: "${c.code_word || 'Pineapple'}"`).join('\n')
        : 'None recorded yet. Consider adding at least 2 trusted individuals.') +
      `\n\n----------------------------------------------------\n` +
      `3. VERIFIED SAFE HAVENS & MEETING POINTS\n` +
      `----------------------------------------------------\n` +
      (safePlaces.length > 0
        ? safePlaces.map((p, i) => `${i + 1}. ${p.name} — ${p.address || 'Address on file'}`).join('\n')
        : 'None recorded yet. Identify at least 2 locations reachable 24/7.') +
      `\n\n----------------------------------------------------\n` +
      `4. CONFIDENTIAL EMERGENCY NOTES\n` +
      `----------------------------------------------------\n` +
      (emergencyNotes ? emergencyNotes : 'No personal notes recorded.') +
      `\n\n----------------------------------------------------\n` +
      `5. EMERGENCY HOTLINES (INDIA)\n` +
      `----------------------------------------------------\n` +
      `• National Emergency Number: 112\n` +
      `• Women Helpline (All India): 1091\n` +
      `• National Commission for Women: 7827170170\n` +
      `• Domestic Violence Helpline: 181\n`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Nivara_Personal_Safety_Plan_${Date.now()}.txt`;
    link.click();
    toast.success('Emergency Plan downloaded');
  };

  const totalSteps = plan?.steps?.length || 0;
  const completedCount = Object.values(completedSteps).filter(Boolean).length;
  const progressPercent = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  return (
    <div className="fixed inset-0 z-40 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
      <div className="max-w-3xl w-full bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex justify-between items-start pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-400/40 flex items-center justify-center text-violet-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base text-white">Personalized Safety & Emergency Action Plan</h2>
                {saving ? (
                  <span className="text-[10px] text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-500/30 animate-pulse">
                    Saving...
                  </span>
                ) : (
                  <span className="text-[10px] text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Saved to Vault
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">Persistent, customized protection protocol tailored to your case risks</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Legal & Emergency Advisory Disclaimer */}
        <div className="mt-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-violet-400 flex-shrink-0" />
          <span>
            <strong>Personal Safety Tool:</strong> This plan is securely stored in your account. NIVARA does not automatically dispatch external emergency services. In immediate danger, dial <strong>112</strong> immediately.
          </span>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 mt-3 pb-2 border-b border-slate-800 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('checklist')}
            className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 ${
              activeTab === 'checklist'
                ? 'bg-violet-600 text-white shadow'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" /> Action Checklist ({completedCount}/{totalSteps})
          </button>

          <button
            onClick={() => setActiveTab('contacts')}
            className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 ${
              activeTab === 'contacts'
                ? 'bg-violet-600 text-white shadow'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Phone className="w-3.5 h-3.5" /> Trusted Contacts ({contacts.length})
          </button>

          <button
            onClick={() => setActiveTab('places')}
            className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 ${
              activeTab === 'places'
                ? 'bg-violet-600 text-white shadow'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" /> Safe Havens ({safePlaces.length})
          </button>

          <button
            onClick={() => setActiveTab('notes')}
            className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 ${
              activeTab === 'notes'
                ? 'bg-violet-600 text-white shadow'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" /> Private Notes
          </button>

          <div className="ml-auto">
            <button
              onClick={handleGeneratePlan}
              disabled={loading}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-violet-300 text-xs flex items-center gap-1 border border-slate-700 transition"
              title="Regenerate AI recommendations while preserving custom steps"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh Suggestions</span>
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {loading ? (
          <div className="py-20 text-center text-slate-400 text-sm">
            <Sparkles className="w-7 h-7 text-violet-400 animate-spin mx-auto mb-3" />
            Loading your persistent safety plan from secure vault...
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4 py-3 pr-1">
            {/* TAB 1: CHECKLIST */}
            {activeTab === 'checklist' && (
              <div className="space-y-3">
                {/* Progress bar */}
                <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
                  <div className="flex justify-between items-center text-xs font-semibold mb-1.5">
                    <span className="text-slate-300">Safety Readiness Score</span>
                    <span className="text-emerald-400">{progressPercent}% Secured</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-emerald-500 h-full transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Steps List */}
                <div className="space-y-2.5">
                  {plan?.steps?.map((step) => {
                    const done = Boolean(completedSteps[step.id]);
                    return (
                      <div
                        key={step.id}
                        className={`p-3.5 rounded-2xl border transition flex items-start gap-3 ${
                          done
                            ? 'bg-emerald-950/30 border-emerald-500/30'
                            : 'bg-slate-950/60 border-slate-800 hover:bg-slate-800/50'
                        }`}
                      >
                        <button 
                          onClick={() => toggleStep(step.id)}
                          className="mt-0.5 text-emerald-400 transition hover:scale-110"
                        >
                          {done ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-slate-500" />}
                        </button>

                        <div className="flex-1" onClick={() => toggleStep(step.id)} style={{ cursor: 'pointer' }}>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-800 text-violet-300 border border-slate-700">
                              {step.category}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              step.priority === 'Critical' ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'
                            }`}>
                              {step.priority || 'High'} Priority
                            </span>
                            {step.is_custom && (
                              <span className="text-[10px] bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded-full border border-sky-500/30">
                                User Added
                              </span>
                            )}
                          </div>

                          <h3 className={`font-bold text-sm mt-1 ${done ? 'line-through text-slate-400' : 'text-slate-100'}`}>
                            {step.title}
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{step.desc}</p>
                        </div>

                        {step.is_custom && (
                          <button
                            onClick={() => handleDeleteStep(step.id)}
                            className="p-1 rounded text-slate-500 hover:text-red-400 transition"
                            title="Delete custom step"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Add Custom Step Section */}
                {showAddStep ? (
                  <form onSubmit={handleAddCustomStep} className="p-4 rounded-2xl bg-slate-950/90 border border-violet-500/40 space-y-3">
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs font-bold text-violet-300 uppercase tracking-wider">Add Custom Safety Action</h4>
                      <button type="button" onClick={() => setShowAddStep(false)} className="text-slate-400 hover:text-white">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="sm:col-span-2">
                        <input
                          type="text"
                          placeholder="Action title (e.g., Hide emergency cash in go-bag)"
                          value={newStepTitle}
                          onChange={(e) => setNewStepTitle(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
                          required
                        />
                      </div>
                      <div>
                        <select
                          value={newStepCategory}
                          onChange={(e) => setNewStepCategory(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
                        >
                          <option value="Personal">Personal</option>
                          <option value="Physical Escape">Physical Escape</option>
                          <option value="Immediate Signal">Immediate Signal</option>
                          <option value="Digital Privacy">Digital Privacy</option>
                          <option value="Evidence Security">Evidence Security</option>
                        </select>
                      </div>
                    </div>

                    <textarea
                      placeholder="Optional details or specific instructions..."
                      value={newStepDesc}
                      onChange={(e) => setNewStepDesc(e.target.value)}
                      rows={2}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
                    />

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAddStep(false)}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 text-xs text-slate-300 hover:bg-slate-700 font-semibold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={saving || !newStepTitle.trim()}
                        className="px-4 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-xs text-white font-bold flex items-center gap-1 shadow"
                      >
                        <Plus className="w-3.5 h-3.5" /> Save Action
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => setShowAddStep(true)}
                    className="w-full py-2.5 rounded-2xl border border-dashed border-slate-700 hover:border-violet-500/60 text-slate-400 hover:text-violet-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition bg-slate-950/40"
                  >
                    <Plus className="w-4 h-4" /> Add Custom Safety Action
                  </button>
                )}
              </div>
            )}

            {/* TAB 2: TRUSTED CONTACTS */}
            {activeTab === 'contacts' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-400">
                  Record 2–3 trusted contacts who understand your duress safe-word.
                </p>

                <div className="space-y-2">
                  {contacts.map((c, idx) => (
                    <div key={idx} className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 flex justify-between items-center">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-white">{c.name}</h4>
                          <span className="text-[10px] bg-violet-950 text-violet-300 px-2 py-0.5 rounded-full border border-violet-800">
                            Safe Word: &quot;{c.code_word || 'Pineapple'}&quot;
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{c.phone} • {c.relationship || 'Trusted Contact'}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteContact(idx)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  {contacts.length === 0 && (
                    <div className="py-6 text-center text-xs text-slate-500">
                      No emergency contacts saved yet. Add your first trusted contact below.
                    </div>
                  )}
                </div>

                <form onSubmit={handleAddContact} className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                  <h4 className="text-xs font-bold text-slate-200">Add Trusted Contact</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Contact Name"
                      value={newContactName}
                      onChange={(e) => setNewContactName(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Phone Number"
                      value={newContactPhone}
                      onChange={(e) => setNewContactPhone(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Duress Code Word"
                      value={newContactCodeWord}
                      onChange={(e) => setNewContactCodeWord(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={saving || !newContactName || !newContactPhone}
                      className="px-3.5 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-xs text-white font-bold flex items-center gap-1 shadow"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Contact
                    </button>
                  </div>
                </form>

                {/* Duress Secret Code Configuration Card */}
                <div className="p-4 rounded-2xl bg-slate-950/90 border border-violet-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-violet-500/20 text-violet-400 flex items-center justify-center">
                        <Key className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-100">Duress Secret Safe-Word & Alert Settings</h4>
                        <p className="text-[11px] text-slate-400">Encrypted with AES-256-GCM at rest in your secure vault</p>
                      </div>
                    </div>
                    {secretCode ? (
                      <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded-full flex items-center gap-1 font-mono">
                        <CheckCircle2 className="w-3 h-3" /> Code Configured
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-400 bg-amber-950/60 border border-amber-800/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Code Not Set
                      </span>
                    )}
                  </div>

                  <form onSubmit={handleSaveSecretCode} className="space-y-3 pt-1">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                        Master Secret Duress Code / Safe-Word
                      </label>
                      <div className="relative">
                        <input
                          type={showSecretCode ? 'text' : 'password'}
                          placeholder="e.g. RED-EAGLE or Pineapple"
                          value={secretCode}
                          onChange={(e) => setSecretCode(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 font-mono pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSecretCode(!showSecretCode)}
                          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                          tabIndex={-1}
                        >
                          {showSecretCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">
                        This secret code authorizes emergency alert dispatch to all your trusted contacts.
                      </p>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                        Custom Emergency Alert Message Template (Optional)
                      </label>
                      <textarea
                        placeholder="e.g. EMERGENCY ALERT: I am in danger and triggering our agreed safety signal. Please call 112 and reach out to me immediately."
                        value={alertMessageTemplate}
                        onChange={(e) => setAlertMessageTemplate(e.target.value)}
                        rows={2}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 leading-relaxed"
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="checkbox"
                        id="includeLocationCheck"
                        checked={alertIncludeLocation}
                        onChange={(e) => setAlertIncludeLocation(e.target.checked)}
                        className="w-4 h-4 rounded text-violet-600 bg-slate-900 border-slate-700 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                      />
                      <label htmlFor="includeLocationCheck" className="text-xs text-slate-300 cursor-pointer select-none">
                        Include live GPS coordinates and Google Maps link when dispatching alert
                      </label>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="submit"
                        disabled={isSavingSecretCode || saving}
                        className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-xs text-white font-bold flex items-center gap-1.5 shadow transition"
                      >
                        <Lock className="w-3.5 h-3.5" /> Save Secret Code & Settings
                      </button>
                    </div>
                  </form>
                </div>

                {/* Emergency Alert Action Hub */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-red-950/40 via-slate-950/80 to-slate-900 border border-red-500/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-red-500/20 text-red-400 border border-red-500/40 flex items-center justify-center">
                        <ShieldAlert className="w-5 h-5 animate-pulse" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                          Emergency Alert to Trusted Contacts
                        </h4>
                        <p className="text-xs text-slate-300">
                          Instant duress notification dispatched to all your designated contacts
                        </p>
                      </div>
                    </div>

                    {lastAlertSentAt && (
                      <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                        Last: {new Date(lastAlertSentAt).toLocaleTimeString()}
                      </span>
                    )}
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300 flex items-center justify-between">
                    <div className="flex items-center gap-2 truncate">
                      <Bell className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="truncate">
                        {contacts.length > 0
                          ? `Ready to notify ${contacts.length} contact(s): ${contacts.map((c) => c.name).join(', ')}`
                          : 'No trusted contacts configured. Add contacts above to enable alerts.'}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 shrink-0 ml-2">
                      {alertIncludeLocation ? '📍 With GPS location' : '🔒 Discreet (no GPS)'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Requires secret-code authorization to confirm intent and prevent accidental triggers.
                    </p>

                    <button
                      type="button"
                      onClick={() => {
                        if (contacts.length === 0) {
                          toast.warning('Please add at least one trusted contact first.');
                          return;
                        }
                        setDispatchSecretCodeInput('');
                        setAlertResult(null);
                        setShowDispatchModal(true);
                      }}
                      disabled={contacts.length === 0}
                      className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition shadow-lg shrink-0 ${
                        contacts.length === 0
                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                          : 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/30 border border-red-500/50'
                      }`}
                    >
                      <Send className="w-4 h-4" />
                      <span>Dispatch Emergency Alert</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: SAFE HAVENS */}
            {activeTab === 'places' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-400">
                  Pre-designate accessible 24/7 places (friend&apos;s home, hospital, local precinct) for emergency shelter.
                </p>

                <div className="space-y-2">
                  {safePlaces.map((p, idx) => (
                    <div key={idx} className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 flex justify-between items-center">
                      <div>
                        <h4 className="text-sm font-bold text-white">{p.name}</h4>
                        <p className="text-xs text-slate-400 mt-0.5">{p.address || 'Address on file'}</p>
                      </div>
                      <button
                        onClick={() => handleDeletePlace(idx)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  {safePlaces.length === 0 && (
                    <div className="py-6 text-center text-xs text-slate-500">
                      No safe locations recorded yet. Add your primary shelter or rendezvous point.
                    </div>
                  )}
                </div>

                <form onSubmit={handleAddPlace} className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                  <h4 className="text-xs font-bold text-slate-200">Add Safe Haven Location</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Location Name (e.g. Sister's Apartment, Metro Station)"
                      value={newPlaceName}
                      onChange={(e) => setNewPlaceName(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Address or Landmark"
                      value={newPlaceAddress}
                      onChange={(e) => setNewPlaceAddress(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={saving || !newPlaceName}
                      className="px-3.5 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-xs text-white font-bold flex items-center gap-1 shadow"
                    >
                      <Plus className="w-3.5 h-3.5" /> Save Location
                    </button>
                  </div>
                </form>

                {/* Nearby Verified Safe Havens from Real Location */}
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-violet-300">
                      <Radio className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Nearby Verified Safe Havens (Auto-detected)</span>
                    </div>
                    <button
                      type="button"
                      onClick={loadNearbySafeHavens}
                      disabled={loadingHavens}
                      className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                    >
                      <RefreshCw className={`w-3 h-3 ${loadingHavens ? 'animate-spin' : ''}`} /> Refresh
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Official Government One Stop Centres and crisis shelters near your location:
                  </p>

                  {loadingHavens ? (
                    <div className="py-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-violet-400" /> Detecting nearest verified safe havens...
                    </div>
                  ) : nearbyHavens.length === 0 ? (
                    <div className="py-3 text-center text-xs text-slate-500">
                      No safe havens detected in immediate area. Click refresh to query the directory.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {nearbyHavens.map((h, i) => {
                        const isSaved = safePlaces.some((p) => p.name.toLowerCase() === h.name.toLowerCase());
                        return (
                          <div key={h.id || i} className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between gap-2 text-xs">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-semibold text-white truncate">{h.name}</span>
                                {h.distance_km != null && (
                                  <span className="text-[10px] text-emerald-400 font-mono font-bold bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-800/40">
                                    {h.distance_km} km
                                  </span>
                                )}
                                <span className="text-[10px] text-cyan-300 bg-cyan-950/60 px-1.5 py-0.2 rounded border border-cyan-800/40">
                                  {h.type === 'one_stop_centre' ? 'Govt OSC' : h.type}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400 truncate mt-0.5">
                                {h.address} {h.phone ? `• Helpline: ${h.phone}` : ''}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {h.latitude && h.longitude && (
                                <button
                                  type="button"
                                  onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${h.latitude},${h.longitude}`, '_blank')}
                                  title="View on Google Maps"
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={saving || isSaved}
                                onClick={() => handleAddHavenToSafePlaces(h)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition ${
                                  isSaved
                                    ? 'bg-slate-800 text-slate-500 cursor-default'
                                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                                }`}
                              >
                                {isSaved ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-400" /> Saved
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-3 h-3" /> Add to Plan
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: PRIVATE NOTES */}
            {activeTab === 'notes' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-400">
                  Confidential notes: cash stashes, hidden car keys, sensitive document locations. Only accessible by your authenticated account.
                </p>

                <textarea
                  value={emergencyNotes}
                  onChange={(e) => setEmergencyNotes(e.target.value)}
                  placeholder="Record essential notes (e.g. Spare car key hidden in laundry room; bank passbook and child birth certificates in blue envelope)..."
                  rows={6}
                  className="w-full bg-slate-950/90 border border-slate-700 rounded-2xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 leading-relaxed"
                />

                <div className="flex justify-end">
                  <button
                    onClick={handleSaveNotes}
                    disabled={saving}
                    className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-xs text-white font-bold flex items-center gap-1.5 shadow"
                  >
                    <Check className="w-3.5 h-3.5" /> Save Notes to Vault
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex justify-between items-center">
          <span className="text-xs text-slate-500">
            {completedCount} of {totalSteps} protocol actions secured ({progressPercent}%)
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 transition">
              Close
            </button>
            <button onClick={downloadPlan} className="px-4 py-2 rounded-xl bg-violet-500 hover:bg-violet-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow transition">
              <Download className="w-3.5 h-3.5" /> Download Full Safety Plan
            </button>
          </div>
        </div>
      </div>

      {/* Dispatch Confirmation & Provider Status Dialog */}
      {showDispatchModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
          <div className="max-w-md w-full bg-slate-900 border border-slate-700 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-red-400 font-bold text-base">
                <ShieldAlert className="w-5 h-5" />
                <span>Confirm Emergency Alert Dispatch</span>
              </div>
              <button
                onClick={() => {
                  setShowDispatchModal(false);
                  setAlertResult(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {alertResult && !alertResult.ok && alertResult.status === 'provider_unavailable' ? (
              <div className="p-3.5 bg-amber-500/15 border border-amber-500/40 rounded-2xl text-xs space-y-3">
                <div className="flex items-start gap-2 text-amber-200">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-sm">Emergency SMS/Telephony Provider Not Configured</p>
                    <p className="text-amber-300/90 text-xs mt-1 leading-relaxed">
                      {alertResult.detail || 'External telephony/SMS delivery is not configured on this server.'}
                    </p>
                    <p className="text-slate-300 text-xs mt-2 font-semibold">
                      Please reach out to your trusted contacts directly or dial national emergency services:
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-amber-500/20">
                  {(alertResult.trusted_contacts || contacts).map((c, idx) => {
                    const cleanPhone = String(c.phone || '').replace(/[^\d+]/g, '');
                    return (
                      <div key={idx} className="flex items-center justify-between p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                        <span className="font-semibold text-slate-200">{c.name}</span>
                        <a
                          href={`tel:${cleanPhone}`}
                          className="px-3 py-1 bg-teal-600/30 hover:bg-teal-600/50 text-teal-200 border border-teal-500/40 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition"
                        >
                          <Phone className="w-3 h-3" /> Call {c.phone}
                        </a>
                      </div>
                    );
                  })}
                </div>

                <p className="text-[11px] text-amber-300/80 italic leading-snug">
                  Note: Clicking &quot;Call&quot; opens your device&apos;s native phone dialer. It does not automatically guarantee or verify connection.
                </p>

                <div className="pt-2 flex items-center justify-between gap-2">
                  <a
                    href="tel:112"
                    className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-center text-xs flex items-center justify-center gap-1.5 shadow"
                  >
                    <Phone className="w-3.5 h-3.5" /> Call 112 (National Emergency)
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDispatchModal(false);
                      setAlertResult(null);
                    }}
                    className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-700"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleTriggerEmergencyAlert} className="space-y-4">
                <p className="text-xs text-slate-300 leading-relaxed">
                  You are about to dispatch an urgent duress alert to{' '}
                  <strong className="text-white">{contacts.length} trusted contact(s)</strong> (
                  {contacts.map((c) => c.name).join(', ')}).
                </p>

                <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs space-y-1 text-slate-400">
                  <div className="font-semibold text-slate-300">Alert Message Preview:</div>
                  <div className="italic text-slate-300 font-mono text-[11px] leading-relaxed">
                    &quot;
                    {alertMessageTemplate ||
                      `EMERGENCY ALERT: I am in an unsafe situation and using our confidential duress signal. Please call emergency services (112) and reach out to me immediately.`}
                    {alertIncludeLocation ? ' [Live GPS Coordinates Link]' : ''}&quot;
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-200 block mb-1">
                    Enter Secret Duress Code / Safe-Word to Authorize:
                  </label>
                  <input
                    type="password"
                    placeholder="Enter your secret code..."
                    value={dispatchSecretCodeInput}
                    onChange={(e) => setDispatchSecretCodeInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500 font-mono"
                    required
                    autoFocus
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Validates your identity and authorization before dispatching the alert.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowDispatchModal(false)}
                    className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isDispatchingAlert || !dispatchSecretCodeInput.trim()}
                    className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-red-600/30 transition disabled:opacity-50"
                  >
                    {isDispatchingAlert ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Authorizing & Dispatching...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Confirm & Send Alert</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
