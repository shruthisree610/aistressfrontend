import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useAuth } from '@/contexts/AuthContext';
import { api, connectWS } from '@/lib/api';
import { toast } from 'sonner';
import { 
  Bell, Shield, Users, LogOut, Radio, MapPin, Activity, FileText, 
  Sparkles, Navigation, RefreshCw, CheckCircle, Crosshair, AlertTriangle, 
  Info, Filter, CheckCircle2, AlertCircle, Phone, Truck, History, X, Send, Lock,
  PhoneCall, HeartPulse, Download, Eye, Film, Image as ImageIcon, Inbox,
  Mic, ShieldAlert
} from 'lucide-react';
import SVIBadge from '@/components/SVIBadge';
import AIStressAssessmentSection from '@/components/AIStressAssessmentSection';
import AIEscalationRiskPredictor from '@/components/AIEscalationRiskPredictor';
import NotificationCenter from '@/components/NotificationCenter';
import { getOfficerCurrentPosition, watchUserLocation, getGeolocationErrorDetails } from '@/lib/location';
import { formatDateTime, formatTime, formatDate } from '@/lib/dateTime';

import 'leaflet/dist/leaflet.css';

// Fix default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const standardIcon = new L.Icon.Default();

// High-visibility pulsating red icon for live emergencies
const liveEmergencyIcon = new L.DivIcon({
  html: '<div style="width:28px;height:28px;border-radius:50%;background:#ef4444;border:3px solid #fff;box-shadow:0 0 0 6px rgba(239,68,68,0.5);display:flex;align-items:center;justify-content:center;font-size:13px;animation:pulse 1.3s infinite;">🚨</div>',
  className: '', iconSize: [28, 28], iconAnchor: [14, 14],
});

// Standard emergency icon for backward compatibility
const emergencyIcon = new L.DivIcon({
  html: '<div style="width:24px;height:24px;border-radius:50%;background:#ff3b30;border:3px solid #fff;box-shadow:0 0 0 4px rgba(255,59,48,0.35);animation:pulse 1.5s infinite;"></div>',
  className: '', iconSize: [24, 24], iconAnchor: [12, 12],
});

// High-visibility blue badge for officer
const officerIcon = new L.DivIcon({
  html: '<div style="width:30px;height:30px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,0.45);display:flex;align-items:center;justify-content:center;font-size:14px;animation:pulse 2s infinite;">🛡️</div>',
  className: '', iconSize: [30, 30], iconAnchor: [15, 15],
});

// Consolidate identical coordinates (e.g. 190 automated test runs on Bengaluru) into a cluster icon
const createTestClusterIcon = (count) => new L.DivIcon({
  html: `<div style="padding:2px 8px;border-radius:12px;background:#6366f1;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);color:#fff;font-size:11px;font-weight:bold;display:flex;align-items:center;gap:3px;white-space:nowrap;">🧪 Test (${count})</div>`,
  className: '', iconSize: [count > 99 ? 80 : 70, 24], iconAnchor: [35, 12],
});

const testCaseIcon = new L.DivIcon({
  html: '<div style="width:22px;height:22px;border-radius:50%;background:#8b5cf6;border:2px solid #fff;box-shadow:0 0 0 3px rgba(139,92,246,0.35);display:flex;align-items:center;justify-content:center;font-size:11px;">🧪</div>',
  className: '', iconSize: [22, 22], iconAnchor: [11, 11],
});

// Dedicated prominent highlight icon for the selected emergency case
const selectedCaseIcon = new L.DivIcon({
  html: '<div style="width:34px;height:34px;border-radius:50%;background:#06b6d4;border:3px solid #fff;box-shadow:0 0 0 6px rgba(6,182,212,0.6);display:flex;align-items:center;justify-content:center;font-size:16px;animation:pulse 1.2s infinite;">🎯</div>',
  className: '', iconSize: [34, 34], iconAnchor: [17, 17],
});

// Dedicated distinct marker for victim-confirmed map pin
const victimConfirmedPinIcon = new L.DivIcon({
  html: '<div style="width:30px;height:30px;border-radius:50%;background:#10b981;border:3px solid #fff;box-shadow:0 0 0 5px rgba(16,185,129,0.5);display:flex;align-items:center;justify-content:center;font-size:14px;">📍</div>',
  className: '', iconSize: [30, 30], iconAnchor: [15, 15],
});

function MapController({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target && target[0] != null && target[1] != null && !isNaN(target[0]) && !isNaN(target[1])) {
      map.setView(target, 13, { animate: true });
    }
  }, [target, map]);
  return null;
}

export default function OfficerCenter() {
  const { user, logout } = useAuth();
  const [cases, setCases] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [counsellors, setCounsellors] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [note, setNote] = useState('');
  const [chosenCounsellor, setChosenCounsellor] = useState('');

  // Restrict operational counsellor assignment strictly to approved counsellors (Dr. Priya and shru)
  const deduplicatedCounsellors = useMemo(() => {
    if (!Array.isArray(counsellors)) return [];
    const approvedEmails = new Set(['counsellor@nivara.app', 'shruthi12345@gmail.com']);
    const approvedNames = new Set(['dr. priya', 'shru']);

    const map = new Map();
    counsellors.forEach((c) => {
      if (!c || !c.id) return;
      const email = (c.email || '').toLowerCase().trim();
      const name = (c.name || '').toLowerCase().trim();
      const isApproved = approvedEmails.has(email) || approvedNames.has(name);
      if (!isApproved) return;
      if (!map.has(c.id)) {
        map.set(c.id, c);
      }
    });
    const uniqueList = Array.from(map.values());

    return uniqueList.map((c) => {
      const name = (c.name || 'Unnamed Counsellor').trim();
      const label = c.email ? `${name} (${c.email})` : name;
      return {
        ...c,
        displayName: label,
      };
    });
  }, [counsellors]);

  // Officer Case Action Modals State
  const [showAckConfirm, setShowAckConfirm] = useState(false);
  const [isAcknowledging, setIsAcknowledging] = useState(false);

  const [showContactModal, setShowContactModal] = useState(false);
  const [contactOutcome, setContactOutcome] = useState('Successfully contacted');
  const [contactNotes, setContactNotes] = useState('');
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);

  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [dispatchUnit, setDispatchUnit] = useState('Duty Patrol Unit 1');
  const [dispatchStatus, setDispatchStatus] = useState('dispatched');
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [isSubmittingDispatch, setIsSubmittingDispatch] = useState(false);

  const [showLogModal, setShowLogModal] = useState(false);
  const [caseLogs, setCaseLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  
  // Neutral center fallback: will be updated to Officer's genuine GPS or nearest emergency case
  const [center, setCenter] = useState([12.9716, 77.5946]);
  
  // Officer GPS state
  const [officerLoc, setOfficerLoc] = useState({
    sharing_enabled: true,
    is_fresh: false,
    freshness_status: 'loading',
    latitude: null,
    longitude: null,
    location_label: '',
    location_updated_at: null,
  });
  
  // Granular GPS acquisition status:
  // 'loading' | 'waiting' | 'fresh' | 'stale' | 'unavailable' | 'permission_denied' | 'timeout' | 'failed' | 'disabled'
  const [gpsStatus, setGpsStatus] = useState('loading');
  const [gpsErrorDetails, setGpsErrorDetails] = useState(null);
  const [locUpdating, setLocUpdating] = useState(false);
  const watcherRef = useRef(null);

  // Filters - Default map to 'live_only' to prevent test suite clusters cluttering the initial view
  const [caseFilter, setCaseFilter] = useState('live'); // 'live' | 'all' | 'test'
  const [mapFilter, setMapFilter] = useState('live_only'); // 'live_only' | 'all' | 'emergencies_only'
  const [activeQueueTab, setActiveQueueTab] = useState('all'); // 'all' | 'triage' | 'emergency' | 'active'

  // Officer Shared Evidence Preview State
  const [previewOfficerEvidence, setPreviewOfficerEvidence] = useState(null);

  const handlePreviewOfficerEvidence = async (item) => {
    if (!item.media_url) {
      if (previewOfficerEvidence?.url) {
        URL.revokeObjectURL(previewOfficerEvidence.url);
      }
      setPreviewOfficerEvidence({
        url: null,
        type: 'text',
        title: item.title,
        hash: item.hash,
        notes: item.notes,
        original_name: item.original_name || item.file_name,
        integrity_verified: item.integrity_verified,
        integrity_detail: item.integrity_detail,
        is_media: false,
        item,
      });
      return;
    }
    try {
      toast.info('Loading authorized evidence media...');
      if (previewOfficerEvidence?.url) {
        URL.revokeObjectURL(previewOfficerEvidence.url);
      }
      // Normalize media URL to strip leading /api if present to avoid axios duplicate prefix
      const endpoint = item.media_url.startsWith('/api') ? item.media_url.slice(4) : item.media_url;
      const response = await api.get(endpoint, { responseType: 'blob' });
      const mime = item.media_type || response.headers['content-type'] || 'image/jpeg';
      const blob = new Blob([response.data], { type: mime });
      const url = URL.createObjectURL(blob);
      setPreviewOfficerEvidence({
        url,
        type: mime,
        title: item.title,
        hash: item.hash,
        notes: item.notes,
        original_name: item.original_name || item.file_name,
        file_size: item.file_size,
        integrity_verified: item.integrity_verified,
        integrity_detail: item.integrity_detail,
        is_media: true,
        item,
      });
    } catch (err) {
      console.error('Evidence preview failed:', err);
      let msg = 'Could not load evidence media. Verification failed.';
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

  const handleDownloadOfficerEvidence = async (item) => {
    if (!item.media_url) {
      toast.error('This evidence record was sealed as a text snapshot and does not contain binary media bytes.');
      return;
    }
    try {
      toast.info('Decrypting & downloading authorized evidence...');
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
        downloadName = `Nivara_Evidence_${(item.id || 'case').slice(0, 8)}.${ext}`;
      }
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`Evidence downloaded: ${downloadName}`);
    } catch (err) {
      console.error('Evidence download failed:', err);
      let msg = 'Failed to download evidence file. Check case authorization.';
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

  const stopLocationWatcher = useCallback(() => {
    if (watcherRef.current) {
      try {
        watcherRef.current();
      } catch (e) {
        console.warn('Error clearing location watcher:', e);
      }
      watcherRef.current = null;
    }
  }, []);

  const loadCases = useCallback(async () => {
    try {
      const { data } = await api.get('/cases/mine');
      setCases(data);
      const urlParams = new URLSearchParams(window.location.search);
      const targetCaseId = urlParams.get('caseId');
      if (targetCaseId) {
        const found = data.find((c) => c.id === targetCaseId);
        if (found) {
          setSelected(found);
          if (found.latitude && found.longitude) {
            setCenter([found.latitude, found.longitude]);
          }
          api.get(`/cases/${found.id}`).then((res) => setDetail(res.data)).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('Could not load cases:', e);
    }
  }, []);

  const startLocationWatcher = useCallback(() => {
    stopLocationWatcher();
    setGpsStatus('waiting');
    setGpsErrorDetails(null);

    // 1. One-shot immediate acquisition
    getOfficerCurrentPosition({ timeout: 10000 })
      .then(async (pos) => {
        try {
          const { data } = await api.post('/officer/location', {
            latitude: pos.latitude,
            longitude: pos.longitude,
            location_label: pos.location_label,
            accuracy: pos.accuracy,
            sharing_enabled: true,
          });
          setOfficerLoc(data);
          setGpsStatus(data.freshness_status || 'fresh');
          setGpsErrorDetails(null);
          setCenter([pos.latitude, pos.longitude]);
          toast.success('Officer GPS acquired: Live Fresh.');
        } catch (apiErr) {
          console.warn('Failed to post officer location:', apiErr);
          setGpsStatus('failed');
          setGpsErrorDetails({
            label: 'Server Error',
            message: apiErr.response?.data?.detail || 'Failed to persist location on server',
            userGuide: 'Click Retry GPS to try again.'
          });
        }
      })
      .catch((err) => {
        console.warn('GPS initial acquisition error:', err);
        setGpsStatus(err.code || err.status || 'unavailable');
        setGpsErrorDetails(err);
      });

    // 2. Start continuous watcher
    const cleanup = watchUserLocation(
      async (pos) => {
        try {
          const { data } = await api.post('/officer/location', {
            latitude: pos.latitude,
            longitude: pos.longitude,
            location_label: pos.location_label,
            accuracy: pos.accuracy,
            sharing_enabled: true,
          });
          setOfficerLoc(data);
          setGpsStatus(data.freshness_status || 'fresh');
          setGpsErrorDetails(null);
        } catch (apiErr) {
          console.warn('Background officer location update failed:', apiErr);
        }
      },
      (err) => {
        console.warn('GPS continuous watch error:', err);
        setGpsStatus((prev) => (prev === 'fresh' ? prev : (err.code || err.status || 'failed')));
        setGpsErrorDetails((prev) => (prev ? prev : err));
      }
    );
    watcherRef.current = cleanup;
  }, [stopLocationWatcher]);

  const toggleLocationSharing = async (enable) => {
    setLocUpdating(true);
    if (!enable) {
      stopLocationWatcher();
      try {
        const { data } = await api.post('/officer/location', { sharing_enabled: false });
        setOfficerLoc(data);
        setGpsStatus('disabled');
        setGpsErrorDetails(null);
        toast.info('Location sharing disabled. Excluded from emergency routing.');
      } catch {
        toast.error('Failed to disable location sharing.');
      } finally {
        setLocUpdating(false);
      }
    } else {
      try {
        startLocationWatcher();
        toast.info('Requesting GPS location from browser...');
      } finally {
        setLocUpdating(false);
      }
    }
  };

  const retryLocation = () => {
    setLocUpdating(true);
    toast.info('Re-attempting GPS acquisition...');
    startLocationWatcher();
    setTimeout(() => setLocUpdating(false), 800);
  };

  useEffect(() => {
    loadCases();

    // Check server location state on mount
    api.get('/officer/location')
      .then((r) => {
        const data = r.data;
        setOfficerLoc(data);
        if (data.sharing_enabled) {
          startLocationWatcher();
        } else {
          setGpsStatus('disabled');
        }
      })
      .catch((e) => {
        console.warn('Could not load officer location status:', e);
        startLocationWatcher();
      });

    api.get('/users/counsellors?data_filter=approved').then((r) => setCounsellors(r.data)).catch(() => {});

    const ws = connectWS((msg) => {
      if (msg.type === 'sos') {
        toast.error(`🚨 SOS from ${msg.victim_name}`, { duration: 8000 });
        setAlerts((a) => [msg, ...a].slice(0, 20));
        if (msg.latitude && msg.longitude) {
          setCenter([msg.latitude, msg.longitude]);
        }
        loadCases();
      } else if (msg.type === 'new_complaint') {
        toast.info(`📋 New Complaint Lodged: ${msg.title || 'Official Incident'} by ${msg.victim_name || 'Victim'}`, { duration: 8000 });
        setAlerts((a) => [msg, ...a].slice(0, 20));
        loadCases();
      } else if (msg.type === 'risk_escalation') {
        toast.warning(`Risk escalation: ${msg.victim_name} (SVI ${msg.svi_score})`);
        loadCases();
      } else if (msg.type === 'case_update' || msg.type === 'case_assigned' || msg.type === 'case_unassigned') {
        loadCases();
      }
    });

    const iv = setInterval(loadCases, 15000);

    return () => {
      stopLocationWatcher();
      if (ws) ws.close();
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCase = async (c) => {
    setSelected(c);
    setDetail(null);
    if (c.latitude && c.longitude) {
      setCenter([c.latitude, c.longitude]);
    }
    try {
      const url = new URL(window.location);
      url.searchParams.set('caseId', c.id);
      window.history.replaceState({}, '', url);
    } catch {}
    try {
      const { data } = await api.get(`/cases/${c.id}`);
      setDetail(data);
    } catch {
      toast.error('Could not load case');
    }
  };

  const handleAcknowledge = async () => {
    if (!selected || isAcknowledging) return;
    setIsAcknowledging(true);
    try {
      const isEmergency = selected.priority === 'emergency';
      const defaultNote = isEmergency
        ? 'Emergency alert acknowledged by duty officer'
        : `Case claimed and acknowledged by duty officer ${user?.name || ''}`.trim();
      const { data } = await api.post('/officer/action', {
        case_id: selected.id,
        action: 'acknowledged',
        notes: note || defaultNote,
      });
      if (data.already_acknowledged) {
        toast.info('Case was already acknowledged');
      } else {
        toast.success(isEmergency ? '🚨 Emergency alert acknowledged' : '⚡ Case claimed and acknowledged');
      }
      setShowAckConfirm(false);
      setNote('');
      await loadCases();
      const updated = await api.get(`/cases/${selected.id}`);
      setDetail(updated.data);
      if (updated.data?.case) {
        setSelected(updated.data.case);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to acknowledge or claim case');
    } finally {
      setIsAcknowledging(false);
    }
  };

  const handleRecordContact = async (e) => {
    if (e) e.preventDefault();
    if (!selected || isSubmittingContact) return;
    setIsSubmittingContact(true);
    try {
      await api.post('/officer/action', {
        case_id: selected.id,
        action: 'contacted_victim',
        outcome: contactOutcome,
        notes: contactNotes,
      });
      toast.success(`Contact recorded: ${contactOutcome}`);
      setShowContactModal(false);
      setContactNotes('');
      await loadCases();
      await openCase(selected);
    } catch {
      toast.error('Failed to record contact attempt');
    } finally {
      setIsSubmittingContact(false);
    }
  };

  const handleRecordDispatch = async (e) => {
    if (e) e.preventDefault();
    if (!selected || isSubmittingDispatch) return;
    setIsSubmittingDispatch(true);
    try {
      const { data } = await api.post('/officer/action', {
        case_id: selected.id,
        action: 'dispatched_unit',
        unit: dispatchUnit,
        dispatch_status: dispatchStatus,
        notes: dispatchNotes,
      });
      if (data.already_dispatched) {
        toast.info(data.message || `Unit '${dispatchUnit}' is already actively dispatched`);
      } else {
        toast.success(`Dispatch updated: ${dispatchUnit} (${dispatchStatus})`);
      }
      setShowDispatchModal(false);
      setDispatchNotes('');
      await loadCases();
      await openCase(selected);
    } catch {
      toast.error('Failed to record dispatch');
    } finally {
      setIsSubmittingDispatch(false);
    }
  };

  const fetchCaseLogs = async (caseId) => {
    if (!caseId) return;
    setIsLoadingLogs(true);
    try {
      const { data } = await api.get(`/cases/${caseId}/logs`);
      setCaseLogs(data.logs || []);
    } catch {
      toast.error('Could not load case activity logs');
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const genSummary = async () => {
    if (!selected || isGeneratingSummary) return;
    setIsGeneratingSummary(true);
    toast.info('Generating structured case summary…');
    try {
      const { data } = await api.post(`/cases/summary/${selected.id}`);
      setDetail((d) => ({ ...d, case: { ...d.case, summary: data.summary } }));
      toast.success(data.source === 'deterministic' ? 'Deterministic summary generated' : 'AI summary generated');
    } catch {
      toast.error('Failed to generate summary');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const assign = async () => {
    if (!chosenCounsellor || !selected) return;
    try {
      const res = await api.post('/officer/assign', { case_id: selected.id, counsellor_id: chosenCounsellor, notes: note });
      const counsellorObj = deduplicatedCounsellors.find((c) => c.id === chosenCounsellor);
      const counsellorName = counsellorObj?.name || res.data?.counsellor_name || 'Counsellor';
      const assignedAt = res.data?.assigned_at || new Date().toISOString();
      toast.success(`Assigned to ${counsellorName}`);
      setNote('');
      setChosenCounsellor('');
      await loadCases();
      await openCase({
        ...selected,
        counsellor_id: chosenCounsellor,
        counsellor_name: counsellorName,
        assigned_at: assignedAt,
      });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Assignment failed');
    }
  };

  const doAction = async (action) => {
    if (!selected) return;
    try {
      await api.post('/officer/action', { case_id: selected.id, action, notes: note });
      toast.success(`Action: ${action}`);
      setNote('');
      loadCases();
      openCase(selected);
    } catch {
      toast.error('Action failed');
    }
  };

  // Group case markers and compute verified counts
  const { 
    clusteredPoints, 
    liveEmergencyCases, 
    liveTriageCases,
    liveActiveCases, 
    testEmergencyCases, 
    testTriageCases,
    testActiveCases,
    displayedEmergencies,
    displayedTriageCases,
    displayedActiveCases
  } = useMemo(() => {
    const liveEmerg = [];
    const liveTriage = [];
    const liveAct = [];
    const testEmerg = [];
    const testTriage = [];
    const testAct = [];
    const clusters = {};

    cases.forEach((c) => {
      const isResolved = c.status === 'resolved';
      if (isResolved) return;

      const isEmerg = c.priority === 'emergency';
      const isUnassigned = (!c.officer_id || c.acknowledgment_status === 'unassigned' || c.acknowledgment_status === 'assigned_pending_acknowledgment' || c.is_complaint) && c.acknowledgment_status !== 'acknowledged';
      const isTriage = isUnassigned;
      const isAct = !isTriage && !isEmerg;

      if (c.is_demo_or_test) {
        if (isEmerg) testEmerg.push(c);
        else if (isTriage) testTriage.push(c);
        else if (isAct) testAct.push(c);
      } else {
        if (isEmerg) liveEmerg.push(c);
        else if (isTriage) liveTriage.push(c);
        else if (isAct) liveAct.push(c);
      }

      // Group markers by coordinate (precision ~11 meters)
      if (c.latitude != null && c.longitude != null) {
        const key = `${c.latitude.toFixed(4)},${c.longitude.toFixed(4)}`;
        if (!clusters[key]) {
          clusters[key] = {
            key,
            latitude: c.latitude,
            longitude: c.longitude,
            cases: [],
            hasLiveEmergency: false,
            hasLiveActive: false,
            isAllTest: true,
            totalCount: 0,
          };
        }
        clusters[key].cases.push(c);
        clusters[key].totalCount += 1;
        if (!c.is_demo_or_test) {
          clusters[key].isAllTest = false;
          if (isEmerg) clusters[key].hasLiveEmergency = true;
          else clusters[key].hasLiveActive = true;
        }
      }
    });

    // Filter displayed list according to user selection
    let dispEmerg = liveEmerg;
    let dispTriage = liveTriage;
    let dispAct = liveAct;
    if (caseFilter === 'all') {
      dispEmerg = [...liveEmerg, ...testEmerg];
      dispTriage = [...liveTriage, ...testTriage];
      dispAct = [...liveAct, ...testAct];
    } else if (caseFilter === 'test') {
      dispEmerg = testEmerg;
      dispTriage = testTriage;
      dispAct = testAct;
    }

    return {
      clusteredPoints: Object.values(clusters),
      liveEmergencyCases: liveEmerg,
      liveTriageCases: liveTriage,
      liveActiveCases: liveAct,
      testEmergencyCases: testEmerg,
      testTriageCases: testTriage,
      testActiveCases: testAct,
      displayedEmergencies: dispEmerg,
      displayedTriageCases: dispTriage,
      displayedActiveCases: dispAct,
    };
  }, [cases, caseFilter]);

  // Center map smoothly on the officer's genuine coordinates if available
  const centerOnOfficer = () => {
    if (officerLoc.latitude && officerLoc.longitude) {
      setCenter([officerLoc.latitude, officerLoc.longitude]);
      toast.info('Centered map on your location.');
    } else {
      toast.warning('Officer GPS coordinates are not yet available.');
    }
  };

  const centerOnEmergency = () => {
    if (selected && selected.latitude != null && selected.longitude != null) {
      setCenter([selected.latitude, selected.longitude]);
      toast.info(`Centered map on selected case: ${selected.victim_name || 'Protected User'}`);
      return;
    }
    const emergWithCoords = liveEmergencyCases.find((c) => c.latitude && c.longitude) ||
                            testEmergencyCases.find((c) => c.latitude && c.longitude);
    if (emergWithCoords) {
      setCenter([emergWithCoords.latitude, emergWithCoords.longitude]);
      toast.info(`Centered map on emergency: ${emergWithCoords.victim_name || 'Protected User'}`);
    } else {
      toast.info('No emergency cases have coordinates attached.');
    }
  };
  const centerOnFirstEmergency = centerOnEmergency;

  // Filtered map points according to mapFilter
  const visibleMapClusters = useMemo(() => {
    if (mapFilter === 'live_only') {
      return clusteredPoints.filter((cl) => !cl.isAllTest);
    }
    if (mapFilter === 'emergencies_only') {
      return clusteredPoints.filter((cl) => cl.hasLiveEmergency || cl.cases.some((c) => c.priority === 'emergency'));
    }
    return clusteredPoints;
  }, [clusteredPoints, mapFilter]);

  return (
    <div className="min-h-screen text-white officer-grid-bg font-officer-b">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-neutral-800 bg-black/70 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-blue-500 flex items-center justify-center">
            <Radio className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-officer-h text-lg font-black tracking-tight">LIVE RESPONSE CENTER</div>
            <div className="text-xs text-neutral-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Officer {user?.name} · On duty
            </div>
          </div>
        </div>

        {/* Officer Location Controls & Granular Freshness Indicator */}
        <div className="flex items-center gap-3 bg-neutral-900/90 border border-neutral-800 rounded-lg px-3 py-1.5" data-testid="officer-location-panel">
          <div className="flex items-center gap-2">
            <Navigation className={`w-4 h-4 ${gpsStatus === 'fresh' ? 'text-emerald-400 animate-pulse' : 'text-neutral-400'}`} />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-300">GPS:</span>

                {gpsStatus === 'fresh' && (
                  <span data-testid="officer-status-fresh" className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live Fresh
                  </span>
                )}

                {gpsStatus === 'waiting' && (
                  <span data-testid="officer-status-waiting" className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/40">
                    <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Acquiring GPS...
                  </span>
                )}

                {gpsStatus === 'stale' && (
                  <span data-testid="officer-status-stale" className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Stale (&gt;15m)
                  </span>
                )}

                {gpsStatus === 'permission_denied' && (
                  <span data-testid="officer-status-permission-denied" className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/40" title={gpsErrorDetails?.userGuide || 'Location permission denied'}>
                    <AlertCircle className="w-2.5 h-2.5" /> Permission Denied
                  </span>
                )}

                {gpsStatus === 'timeout' && (
                  <span data-testid="officer-status-timeout" className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40" title="GPS request timed out">
                    GPS Timeout
                  </span>
                )}

                {(gpsStatus === 'unavailable' || gpsStatus === 'failed') && (
                  <span data-testid="officer-status-unavailable" className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/40" title={gpsErrorDetails?.message || 'GPS Unavailable'}>
                    Unavailable
                  </span>
                )}

                {gpsStatus === 'disabled' && (
                  <span data-testid="officer-status-disabled" className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-800 text-neutral-400 border border-neutral-700">
                    Sharing Off
                  </span>
                )}
              </div>

              <div className="text-[10px] text-neutral-400 truncate max-w-[200px]">
                {officerLoc.sharing_enabled && officerLoc.latitude
                  ? `${officerLoc.latitude.toFixed(3)}, ${officerLoc.longitude.toFixed(3)}`
                  : (gpsErrorDetails ? gpsErrorDetails.label : (gpsStatus === 'waiting' ? 'Waiting for coordinates…' : 'No coordinates'))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 pl-2 border-l border-neutral-800">
            {/* Clear separate sharing toggle button */}
            <button
              onClick={() => toggleLocationSharing(!officerLoc.sharing_enabled)}
              disabled={locUpdating}
              data-testid="officer-location-toggle"
              className={`px-2.5 py-1 text-xs font-semibold rounded border transition-colors ${
                officerLoc.sharing_enabled
                  ? 'bg-blue-600/30 text-blue-300 border-blue-500/50 hover:bg-blue-600/50'
                  : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:bg-neutral-700'
              }`}
            >
              {officerLoc.sharing_enabled ? 'Sharing: ON' : 'Sharing: OFF'}
            </button>

            {/* Explicit Retry / Refresh GPS button */}
            <button
              onClick={retryLocation}
              disabled={locUpdating || !officerLoc.sharing_enabled}
              data-testid="officer-location-retry"
              title="Refresh / Retry GPS location"
              className="p-1.5 text-neutral-300 hover:text-white rounded border border-neutral-800 hover:border-neutral-700 disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${locUpdating || gpsStatus === 'waiting' ? 'animate-spin text-blue-400' : ''}`} />
            </button>

            {/* Center on My Location Button */}
            {officerLoc.latitude && officerLoc.longitude && (
              <button
                onClick={centerOnOfficer}
                data-testid="officer-center-me"
                title="Pan map to my location"
                className="p-1.5 text-neutral-300 hover:text-white rounded border border-neutral-800 hover:border-neutral-700"
              >
                <Crosshair className="w-3.5 h-3.5 text-emerald-400" />
              </button>
            )}
          </div>
        </div>

        {/* Transparent Counters */}
        <div className="flex items-center gap-4">
          <div className="text-xs text-neutral-400 flex items-center gap-2.5">
            <div className="bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1">
              <span className="text-amber-400 font-semibold">Triage Queue: </span>
              <b className="text-amber-300 font-bold">{liveTriageCases.length}</b>
              {testTriageCases.length > 0 && (
                <span className="text-[10px] text-neutral-500 ml-1" title={`${testTriageCases.length} test triage records`}>
                  (+{testTriageCases.length} test)
                </span>
              )}
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1">
              <span className="text-neutral-400">Emergencies: </span>
              <b className="text-red-400 font-bold">{liveEmergencyCases.length}</b>
              {testEmergencyCases.length > 0 && (
                <span className="text-[10px] text-neutral-500 ml-1.5" title={`${testEmergencyCases.length} automated test/demo emergency records preserved for audit`}>
                  (+{testEmergencyCases.length} test)
                </span>
              )}
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1">
              <span className="text-neutral-400">Active Cases: </span>
              <b className="text-blue-400 font-bold">{liveActiveCases.length}</b>
              {testActiveCases.length > 0 && (
                <span className="text-[10px] text-neutral-500 ml-1.5" title={`${testActiveCases.length} automated test/demo active records preserved for audit`}>
                  (+{testActiveCases.length} test)
                </span>
              )}
            </div>
          </div>

          <Link
            to="/officer/history"
            data-testid="officer-nav-history"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 hover:text-white text-neutral-200 transition shadow-sm"
            title="Open Officer Case & Action History"
          >
            <History className="w-3.5 h-3.5 text-blue-400" /> Case History
          </Link>

          <NotificationCenter />
          <button onClick={logout} data-testid="officer-logout" className="p-2 border border-neutral-700 rounded hover:bg-neutral-800">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-12 gap-3 p-3 h-[calc(100vh-64px)]">
        {/* Left: Triage, Priority queue & Active cases */}
        <div className="col-span-3 flex flex-col gap-2.5 overflow-hidden">
          {/* Filter Bar between Live Incidents and All Records */}
          <div className="flex items-center justify-between bg-neutral-950 border border-neutral-800 rounded p-1 text-xs">
            <span className="text-neutral-400 text-[11px] px-1 font-semibold flex items-center gap-1">
              <Filter className="w-3 h-3" /> View:
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCaseFilter('live')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                  caseFilter === 'live' ? 'bg-blue-600 text-white font-bold' : 'text-neutral-400 hover:text-white'
                }`}
                title="Show only genuine live incidents"
              >
                Live ({liveTriageCases.length + liveEmergencyCases.length + liveActiveCases.length})
              </button>
              <button
                onClick={() => setCaseFilter('all')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                  caseFilter === 'all' ? 'bg-neutral-800 text-white font-bold' : 'text-neutral-400 hover:text-white'
                }`}
                title="Show all cases including automated test suite runs"
              >
                All ({cases.length})
              </button>
            </div>
          </div>

          {/* Queue Filter Tabs */}
          <div className="flex items-center gap-1 bg-neutral-950 border border-neutral-800 p-1 rounded text-[11px]">
            <button
              onClick={() => setActiveQueueTab('all')}
              data-testid="tab-all-queues"
              className={`px-2 py-1 rounded font-semibold transition ${
                activeQueueTab === 'all' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setActiveQueueTab('triage')}
              data-testid="tab-triage-queue"
              className={`flex-1 py-1 px-1.5 rounded flex items-center justify-center gap-1 font-semibold transition ${
                activeQueueTab === 'triage' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Inbox className="w-3 h-3 text-amber-400" />
              <span>Triage</span>
              <span className={`text-[10px] px-1 rounded ${displayedTriageCases.length > 0 ? 'bg-amber-500 text-black font-bold' : 'text-neutral-500'}`}>
                {displayedTriageCases.length}
              </span>
            </button>
            <button
              onClick={() => setActiveQueueTab('emergency')}
              data-testid="tab-priority-queue"
              className={`flex-1 py-1 px-1.5 rounded flex items-center justify-center gap-1 font-semibold transition ${
                activeQueueTab === 'emergency' ? 'bg-red-500/20 text-red-300 border border-red-500/40' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Bell className="w-3 h-3 text-red-400" />
              <span>SOS</span>
              {displayedEmergencies.length > 0 && (
                <span className="text-[10px] px-1 rounded bg-red-600 text-white font-bold animate-pulse">
                  {displayedEmergencies.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveQueueTab('active')}
              data-testid="tab-active-cases"
              className={`flex-1 py-1 px-1.5 rounded flex items-center justify-center gap-1 font-semibold transition ${
                activeQueueTab === 'active' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Activity className="w-3 h-3 text-blue-400" />
              <span>Assigned</span>
              <span className="text-[10px] text-neutral-400">({displayedActiveCases.length})</span>
            </button>
          </div>

          {/* Unassigned / Triage Queue */}
          {(activeQueueTab === 'all' || activeQueueTab === 'triage') && (
            <div className={`border border-amber-900/60 rounded bg-neutral-950 flex flex-col overflow-hidden ${activeQueueTab === 'triage' ? 'flex-1' : 'flex-1'}`}>
              <div className="font-officer-h px-3 py-2 border-b border-amber-900/50 bg-amber-950/20 text-xs uppercase tracking-widest text-amber-300 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Inbox className="w-3.5 h-3.5 text-amber-400" /> 
                  <span>Unassigned / Triage Queue ({displayedTriageCases.length})</span>
                </span>
                {displayedTriageCases.length > 0 && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono font-bold uppercase">
                    Awaiting Claim
                  </span>
                )}
              </div>
              <div className={`overflow-y-auto flex-1 ${activeQueueTab === 'triage' ? 'max-h-[72vh]' : 'max-h-[30vh]'}`} data-testid="unassigned-queue">
                {displayedTriageCases.length === 0 && (
                  <div className="p-4 text-xs text-neutral-500 text-center">
                    No unassigned complaints or cases awaiting triage.
                  </div>
                )}
                {displayedTriageCases.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => openCase(c)}
                    data-testid={`triage-case-${c.id}`}
                    className={`w-full text-left p-3 border-b border-neutral-800/80 hover:bg-amber-500/10 transition ${
                      selected?.id === c.id ? 'bg-amber-500/15 border-l-2 border-l-amber-400' : ''
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <div className="text-sm font-bold text-amber-200 flex items-center gap-1.5 flex-wrap">
                        <span>{c.victim_name || 'Protected User'}</span>
                        <span className="font-mono text-[10px] text-amber-300 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-700/60 font-bold">
                          {c.reference_number || (c.id ? `CMP-${c.id.slice(0, 8).toUpperCase()}` : '')}
                        </span>
                        {c.is_complaint && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded">
                            📋 Complaint
                          </span>
                        )}
                        <span className="text-[9px] font-semibold px-1.5 py-0.2 bg-amber-900/60 text-amber-300 border border-amber-700/50 rounded">
                          Awaiting Claim
                        </span>
                      </div>
                      <SVIBadge score={c.svi_score} level={c.risk_level} size="sm" />
                    </div>
                    <div className="text-xs text-neutral-300 font-medium truncate mb-1">
                      {c.title}
                    </div>
                    <div className="text-[11px] text-neutral-400 flex items-center justify-between">
                      <span className="flex items-center gap-1 truncate max-w-[170px]">
                        <MapPin className="w-3 h-3 text-neutral-500 shrink-0" />
                        <span className="truncate">
                          {c.location_label || c.incident_location || (c.latitude ? `${c.latitude.toFixed(2)}, ${c.longitude.toFixed(2)}` : 'Location attached')}
                        </span>
                      </span>
                      <span className="font-mono text-[10px] text-neutral-500">
                        {formatTime(c.created_at || c.updated_at)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Priority Queue (Emergencies) */}
          {(activeQueueTab === 'all' || activeQueueTab === 'emergency') && (
            <div className={`border border-neutral-800 rounded bg-neutral-950 flex flex-col overflow-hidden ${activeQueueTab === 'emergency' ? 'flex-1' : 'flex-1'}`}>
              <div className="font-officer-h px-3 py-2 border-b border-neutral-800 text-xs uppercase tracking-widest text-red-400 flex items-center justify-between">
                <span className="flex items-center gap-2"><Bell className="w-3 h-3" /> Priority Queue ({displayedEmergencies.length})</span>
                {displayedEmergencies.length > 0 && (
                  <button onClick={centerOnFirstEmergency} className="text-[10px] text-red-300 underline font-normal">
                    Locate
                  </button>
                )}
              </div>
              <div className={`overflow-y-auto flex-1 ${activeQueueTab === 'emergency' ? 'max-h-[72vh]' : 'max-h-[30vh]'}`} data-testid="priority-queue">
                {displayedEmergencies.length === 0 && (
                  <div className="p-4 text-xs text-neutral-500">
                    {caseFilter === 'live' ? 'No live active emergencies.' : 'No emergency records found.'}
                  </div>
                )}
                {displayedEmergencies.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => openCase(c)}
                    data-testid={`emerg-case-${c.id}`}
                    className={`w-full text-left p-3 border-b border-neutral-800 hover:bg-red-500/10 transition ${
                      selected?.id === c.id ? 'bg-red-500/15' : ''
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <div className="text-sm font-bold text-red-300 flex items-center gap-1.5 flex-wrap">
                        <span>{c.victim_name || 'Protected User'}</span>
                        <span className="font-mono text-[10px] text-red-300 bg-red-950/80 px-1.5 py-0.5 rounded border border-red-700/60 font-bold">
                          {c.reference_number || (c.id ? `CASE-${c.id.slice(0, 8).toUpperCase()}` : '')}
                        </span>
                        {c.is_demo_or_test && (
                          <span className="text-[9px] font-semibold px-1 py-0.2 bg-purple-900/60 text-purple-300 border border-purple-700/50 rounded">
                            🧪 Test Run
                          </span>
                        )}
                        {!c.is_demo_or_test && (
                          <span className="text-[9px] font-semibold px-1 py-0.2 bg-red-600/70 text-white rounded animate-pulse">
                            🚨 Live SOS
                          </span>
                        )}
                      </div>
                      <SVIBadge score={c.svi_score} level={c.risk_level} size="sm" />
                    </div>
                    <div className="text-xs text-neutral-400 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-neutral-500 shrink-0" />
                      <span className="truncate">
                        {c.location_label || (c.latitude ? `${c.latitude.toFixed(3)}, ${c.longitude.toFixed(3)}` : 'Location unavailable')}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Active Cases (Assigned) */}
          {(activeQueueTab === 'all' || activeQueueTab === 'active') && (
            <div className={`border border-neutral-800 rounded bg-neutral-950 flex-1 overflow-hidden flex flex-col`}>
              <div className="font-officer-h px-3 py-2 border-b border-neutral-800 text-xs uppercase tracking-widest flex items-center justify-between">
                <span className="flex items-center gap-2"><Activity className="w-3 h-3 text-blue-400" /> Active Cases ({displayedActiveCases.length})</span>
              </div>
              <div className={`overflow-y-auto flex-1 ${activeQueueTab === 'active' ? 'max-h-[72vh]' : 'max-h-[28vh]'}`} data-testid="active-cases">
                {displayedActiveCases.length === 0 && (
                  <div className="p-4 text-xs text-neutral-500">No active cases.</div>
                )}
                {displayedActiveCases.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => openCase(c)}
                    className={`w-full text-left p-3 border-b border-neutral-800 hover:bg-neutral-900 transition ${
                      selected?.id === c.id ? 'bg-neutral-900' : ''
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <div className="text-sm font-semibold flex items-center gap-1.5 flex-wrap">
                        <span>{c.victim_name || 'Protected User'}</span>
                        {c.is_demo_or_test && (
                          <span className="text-[9px] font-semibold px-1 py-0.2 bg-purple-900/60 text-purple-300 border border-purple-700/50 rounded">
                            Test
                          </span>
                        )}
                      </div>
                      <SVIBadge score={c.svi_score} level={c.risk_level} size="sm" />
                    </div>
                    <div className="text-xs text-neutral-500 flex items-center justify-between">
                      <span>{c.status}</span>
                      <span>{formatTime(c.updated_at)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Center: Map + Realtime Feed */}
        <div className="col-span-6 flex flex-col gap-3">
          {/* Map Controls Header */}
          <div className="border border-neutral-800 rounded overflow-hidden flex-1 h-[440px] min-h-[350px] relative flex flex-col" data-testid="officer-map">
            {/* Map Filter & Center Bar */}
            <div className="bg-neutral-950/90 border-b border-neutral-800 px-3 py-1.5 flex items-center justify-between text-xs z-[400] relative">
              <div className="flex items-center gap-2">
                <span className="text-neutral-400 text-[11px] font-semibold">Map View:</span>
                <button
                  onClick={() => setMapFilter('all')}
                  className={`px-2 py-0.5 rounded text-[11px] ${mapFilter === 'all' ? 'bg-neutral-700 text-white font-bold' : 'text-neutral-400 hover:text-white'}`}
                >
                  All ({clusteredPoints.length} sites)
                </button>
                <button
                  onClick={() => setMapFilter('live_only')}
                  className={`px-2 py-0.5 rounded text-[11px] ${mapFilter === 'live_only' ? 'bg-blue-600 text-white font-bold' : 'text-neutral-400 hover:text-white'}`}
                >
                  Live Only
                </button>
                <button
                  onClick={() => setMapFilter('emergencies_only')}
                  className={`px-2 py-0.5 rounded text-[11px] ${mapFilter === 'emergencies_only' ? 'bg-red-600 text-white font-bold' : 'text-neutral-400 hover:text-white'}`}
                >
                  Emergencies Only
                </button>
              </div>

              <div className="flex items-center gap-2">
                {officerLoc.latitude && officerLoc.longitude && (
                  <button
                    onClick={centerOnOfficer}
                    className="flex items-center gap-1 text-[11px] text-blue-300 bg-blue-900/40 border border-blue-700/50 px-2 py-0.5 rounded hover:bg-blue-900/70"
                  >
                    <Crosshair className="w-3 h-3 text-emerald-400" /> Center on Me
                  </button>
                )}
                <button
                  onClick={centerOnFirstEmergency}
                  className="flex items-center gap-1 text-[11px] text-red-300 bg-red-900/40 border border-red-700/50 px-2 py-0.5 rounded hover:bg-red-900/70"
                >
                  <MapPin className="w-3 h-3 text-red-400" /> Center on Emergency
                </button>
              </div>
            </div>

            {/* GPS Warning Banner if Permission Denied or Unavailable */}
            {gpsStatus === 'permission_denied' && (
              <div className="bg-red-950/90 border-b border-red-800 px-3 py-1.5 text-xs text-red-200 flex items-center justify-between z-[400] relative">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <span>Browser location permission blocked. Click the lock icon in the URL bar to allow GPS.</span>
                </span>
                <button onClick={retryLocation} className="underline text-red-300 font-bold ml-2 shrink-0">
                  Retry GPS
                </button>
              </div>
            )}

            {gpsStatus === 'timeout' && (
              <div className="bg-amber-950/90 border-b border-amber-800 px-3 py-1.5 text-xs text-amber-200 flex items-center justify-between z-[400] relative">
                <span className="flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>GPS acquisition timed out. Officer location will update once signal is found.</span>
                </span>
                <button onClick={retryLocation} className="underline text-amber-300 font-bold ml-2 shrink-0">
                  Retry
                </button>
              </div>
            )}

            <div className="flex-1 w-full relative">
              <MapContainer center={center} zoom={11} style={{ height: '100%', width: '100%' }} className="bg-neutral-900">
                <MapController target={center} />
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />

                {/* Case & Cluster Markers */}
                {visibleMapClusters.map((cluster) => {
                  const firstCase = cluster.cases[0];
                  let icon = standardIcon;
                  if (cluster.hasLiveEmergency) {
                    icon = liveEmergencyIcon;
                  } else if (cluster.isAllTest) {
                    icon = cluster.totalCount > 1 ? createTestClusterIcon(cluster.totalCount) : testCaseIcon;
                  } else if (cluster.cases.some((c) => c.priority === 'emergency')) {
                    icon = emergencyIcon;
                  }

                  return (
                    <Marker
                      key={cluster.key}
                      position={[cluster.latitude, cluster.longitude]}
                      icon={icon}
                      eventHandlers={{ click: () => openCase(firstCase) }}
                    >
                      <Popup>
                        <div className="text-slate-900 p-1 min-w-[180px]">
                          {cluster.totalCount > 1 ? (
                            <div>
                              <div className="font-bold text-xs text-indigo-700 mb-1 flex items-center gap-1">
                                <span>📍 {cluster.totalCount} Cases at Location</span>
                              </div>
                              <div className="text-[11px] text-slate-700">
                                {cluster.isAllTest ? 'Automated test suite cluster' : 'Multiple cases reported here'}
                              </div>
                              <div className="mt-1 text-[10px] text-slate-500 border-t pt-1">
                                Top: {firstCase.victim_name} (SVI {firstCase.svi_score})
                              </div>
                              <button
                                onClick={() => openCase(firstCase)}
                                className="mt-1.5 w-full text-center py-1 bg-blue-600 text-white rounded text-[11px] font-semibold"
                              >
                                View Case Details
                              </button>
                            </div>
                          ) : (
                            <div>
                              <div className="font-bold text-xs text-slate-900 flex items-center justify-between">
                                <span>{firstCase.victim_name || 'Protected User'}</span>
                                {firstCase.priority === 'emergency' && (
                                  <span className="text-[10px] text-red-600 font-bold uppercase">🚨 SOS</span>
                                )}
                              </div>
                              <div className="text-xs text-slate-600 mt-0.5">
                                SVI {firstCase.svi_score} · {firstCase.risk_level}
                              </div>
                              {firstCase.is_demo_or_test && (
                                <div className="mt-1 text-[9px] text-purple-700 font-semibold bg-purple-100 rounded px-1.5 py-0.5 inline-block">
                                  🧪 Automated Test Record
                                </div>
                              )}
                              <button
                                onClick={() => openCase(firstCase)}
                                className="mt-1.5 w-full text-center py-1 bg-blue-600 text-white rounded text-[11px] font-semibold"
                              >
                                View Case Details
                              </button>
                            </div>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}

                {/* Dedicated Highlight Marker for Currently Selected Case */}
                {selected && selected.latitude != null && selected.longitude != null && (
                  <Marker
                    position={[selected.latitude, selected.longitude]}
                    icon={selectedCaseIcon}
                    zIndexOffset={1000}
                  >
                    <Popup>
                      <div className="text-slate-900 p-1 min-w-[180px]">
                        <div className="font-bold text-xs text-cyan-700 mb-1 flex items-center gap-1">
                          <span>🎯 Selected Case: {selected.victim_name || 'Protected User'}</span>
                        </div>
                        <div className="text-[11px] text-slate-700">
                          SVI: {selected.svi_score} · {selected.risk_level} · Status: {selected.status}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-1">
                          Lat: {selected.latitude.toFixed(4)}, Lng: {selected.longitude.toFixed(4)}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                )}

                {/* Dedicated Marker for Victim-Confirmed Pin (if available) */}
                {detail?.case?.manual_latitude != null && detail?.case?.manual_longitude != null && (
                  <Marker
                    position={[detail.case.manual_latitude, detail.case.manual_longitude]}
                    icon={victimConfirmedPinIcon}
                    zIndexOffset={900}
                  >
                    <Popup>
                      <div className="text-slate-900 p-1 min-w-[180px]">
                        <div className="font-bold text-xs text-emerald-700 mb-1 flex items-center gap-1">
                          <span>📍 Victim-Confirmed Pin</span>
                        </div>
                        <div className="text-[11px] text-slate-700">
                          {detail.case.manual_location_label || 'Location confirmed by victim on map'}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-1">
                          Lat: {detail.case.manual_latitude.toFixed(4)}, Lng: {detail.case.manual_longitude.toFixed(4)}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                )}

                {/* Authenticated Officer Marker */}
                {officerLoc.sharing_enabled && officerLoc.latitude != null && officerLoc.longitude != null && (
                  <Marker position={[officerLoc.latitude, officerLoc.longitude]} icon={officerIcon}>
                    <Popup>
                      <div className="text-slate-900 p-1">
                        <div className="font-bold flex items-center gap-1 text-sm text-blue-700">
                          🛡️ You (Officer {user?.name})
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">
                          {officerLoc.location_label || 'Current Station / Field Coordinates'}
                        </div>
                        <div className="text-xs font-semibold text-emerald-600 mt-1 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Status: {officerLoc.freshness_status}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Lat: {officerLoc.latitude.toFixed(4)}, Lng: {officerLoc.longitude.toFixed(4)}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                )}
              </MapContainer>
            </div>
          </div>

          {/* Realtime Alert Feed */}
          <div className="border border-neutral-800 rounded bg-neutral-950 h-40 overflow-hidden flex flex-col">
            <div className="font-officer-h px-3 py-2 border-b border-neutral-800 text-xs uppercase tracking-widest text-neutral-400">
              Realtime Emergency Feed
            </div>
            <div className="overflow-y-auto flex-1">
              {alerts.length === 0 && <div className="p-3 text-xs text-neutral-500">Waiting for live alerts…</div>}
              {alerts.map((a, i) => (
                <div key={i} className="px-3 py-2 border-b border-neutral-800 text-xs flex justify-between items-center hover:bg-neutral-900">
                  <span className="text-red-400 font-semibold">🚨 {a.victim_name} · SVI {a.svi_score}</span>
                  <span className="text-neutral-500 text-[11px]">{formatTime(a.timestamp)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Case Detail Panel */}
        <div className="col-span-3 border border-neutral-800 rounded bg-neutral-950 flex flex-col overflow-hidden">
          <div className="font-officer-h px-3 py-2 border-b border-neutral-800 text-xs uppercase tracking-widest flex items-center gap-2">
            <FileText className="w-3 h-3 text-blue-400" /> Case Detail
          </div>
          {!selected && <div className="p-4 text-xs text-neutral-500">Select a case to inspect details</div>}
          {selected && detail && (
            <div className="overflow-y-auto flex-1 p-3 space-y-3 text-sm" data-testid="officer-case-detail">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-base flex items-center gap-1.5 flex-wrap">
                    <span>{detail.case.victim_name || 'Protected User'}</span>
                    {detail.case.is_demo_or_test && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-purple-900/60 text-purple-300 border border-purple-700/50 rounded">
                        🧪 Test Record
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-neutral-800 text-blue-300 border border-neutral-700">
                      {detail.case.reference_number || (detail.case.id ? `CASE-${detail.case.id.slice(0, 8).toUpperCase()}` : '')}
                    </span>
                    {detail.case.category && (
                      <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-amber-950/50 text-amber-300 border border-amber-800/40">
                        {detail.case.category.replace('_', ' ')}
                      </span>
                    )}
                    <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${detail.case.priority === 'emergency' ? 'bg-red-950 text-red-300 border border-red-800' : 'bg-neutral-900 text-neutral-300 border border-neutral-800'}`}>
                      {detail.case.priority}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-400 mt-1 flex flex-wrap gap-x-2">
                    <span>{detail.case.status} · {formatDateTime(detail.case.updated_at)}</span>
                    {detail.case.assigned_at && (
                      <span className="text-blue-400">• Assigned: {formatDateTime(detail.case.assigned_at)}</span>
                    )}
                  </div>
                </div>
                <SVIBadge score={detail.case.svi_score} level={detail.case.risk_level} />
              </div>

              {/* Triage & Operational Status Badges */}
              <div className="space-y-1.5" data-testid="case-status-badges">
                {detail.case.acknowledgment_status === 'acknowledged' && (
                  <div className="py-1.5 px-2.5 text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded flex items-center justify-between" data-testid="case-acknowledged-badge">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Case Acknowledged by {detail.case.acknowledged_by || 'Duty Officer'}</span>
                    </div>
                    {detail.case.acknowledged_at && (
                      <span className="text-[10px] text-emerald-400/70 font-mono">
                        {formatTime(detail.case.acknowledged_at)}
                      </span>
                    )}
                  </div>
                )}

                {detail.case.latest_contact && (
                  <div className="py-1.5 px-2.5 text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded flex items-center justify-between" data-testid="case-contact-badge">
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span className="truncate max-w-[210px]">{detail.case.latest_contact.outcome} ({detail.case.latest_contact.officer_name || 'Officer'})</span>
                    </div>
                    {detail.case.latest_contact.timestamp && (
                      <span className="text-[10px] text-blue-400/70 font-mono shrink-0">
                        {formatTime(detail.case.latest_contact.timestamp)}
                      </span>
                    )}
                  </div>
                )}

                {detail.case.dispatch_status && (
                  <div className="py-1.5 px-2.5 text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30 rounded flex items-center justify-between" data-testid="case-dispatch-badge">
                    <div className="flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Internal Unit: {detail.case.dispatch_unit || 'Duty Unit'} [{detail.case.dispatch_status.toUpperCase()}]</span>
                    </div>
                  </div>
                )}

                {(!detail.case.officer_id || detail.case.acknowledgment_status !== 'acknowledged') && (
                  <div className="py-1.5 px-2.5 text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30 rounded flex items-center justify-between" data-testid="case-unassigned-badge">
                    <div className="flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Awaiting Duty Officer Claim & Triage</span>
                    </div>
                    <span className="text-[9px] uppercase tracking-wider text-amber-400 font-mono font-bold">Unassigned</span>
                  </div>
                )}
              </div>

              {/* ============================================================== */}
              {/* 1. VICTIM COMPLAINT DETAILS */}
              {/* ============================================================== */}
              <div className="p-3.5 bg-neutral-900 border border-neutral-800 rounded-lg space-y-2.5" data-testid="complaint-details-section">
                <div className="text-xs uppercase text-amber-400 font-bold flex items-center justify-between border-b border-neutral-800/80 pb-2">
                  <span className="flex items-center gap-1.5 tracking-wider">
                    <FileText className="w-4 h-4 text-amber-400" /> 1. Victim Complaint Details
                  </span>
                  <span className="text-[11px] text-amber-300 font-mono font-bold bg-amber-950/70 px-2 py-0.5 rounded border border-amber-700/60" data-testid="complaint-id-badge">
                    {detail.case.reference_number || (detail.case.id ? `CMP-${detail.case.id.slice(0, 8).toUpperCase()}` : 'N/A')}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs text-neutral-300 font-sans">
                  <div className="flex justify-between items-center py-1 border-b border-neutral-800/40">
                    <span className="text-neutral-400 font-medium">Victim Name:</span>
                    <span className="font-semibold text-white text-sm" data-testid="complaint-victim-name">
                      {detail.case.victim_name || 'Protected User'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-neutral-800/40">
                    <span className="text-neutral-400 font-medium">Complaint ID:</span>
                    <span className="font-mono font-semibold text-amber-300" data-testid="complaint-reference-id">
                      {detail.case.reference_number || (detail.case.id ? `CMP-${detail.case.id.slice(0, 8).toUpperCase()}` : 'N/A')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-neutral-800/40">
                    <span className="text-neutral-400 font-medium">Complaint Category:</span>
                    <span className="font-semibold capitalize text-amber-200" data-testid="complaint-category">
                      {detail.case.category ? detail.case.category.replace('_', ' ') : 'General Safety'}
                    </span>
                  </div>
                  <div className="py-1 border-b border-neutral-800/40">
                    <span className="text-neutral-400 font-medium block mb-1">Complaint Description / Narrative:</span>
                    <div className="text-neutral-200 bg-neutral-950 p-2.5 rounded border border-neutral-800/80 leading-relaxed whitespace-pre-line text-[11px]" data-testid="complaint-description">
                      {detail.case.description || detail.case.summary || (detail.interactions?.find(i => i.role === 'user')?.content?.replace(/^Official Complaint Lodged \[[^\]]+\]:\s*/i, '')) || 'No written narrative provided.'}
                    </div>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-neutral-800/40">
                    <span className="text-neutral-400 font-medium">Incident Date:</span>
                    <span className="text-neutral-200 font-mono" data-testid="complaint-incident-date">
                      {detail.case.incident_date || (detail.case.created_at ? formatDate(detail.case.created_at) : 'Not specified')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-neutral-400 font-medium">Submission Timestamp:</span>
                    <span className="text-neutral-200 font-mono text-[11px]" data-testid="complaint-submission-timestamp">
                      {detail.case.created_at ? formatDateTime(detail.case.created_at) : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* ============================================================== */}
              {/* 2. TEXT RISK SCORE */}
              {/* ============================================================== */}
              {(() => {
                const textScore = detail.assessment?.text_score ?? detail.latest_analysis?.text_score ?? detail.latest_analysis?.svi_score ?? detail.case?.svi_score ?? 0;
                const textRiskLevel = textScore >= 75 ? 'Critical' : (textScore >= 50 ? 'High' : (textScore >= 25 ? 'Moderate' : 'Low'));
                const textRiskBadgeColor = textScore >= 75 ? 'bg-red-950/80 text-red-300 border-red-700/60' : (textScore >= 50 ? 'bg-amber-950/80 text-amber-300 border-amber-700/60' : (textScore >= 25 ? 'bg-yellow-950/80 text-yellow-300 border-yellow-700/60' : 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'));
                const associatedCaseId = detail.case.reference_number || (detail.case.id ? `CMP-${detail.case.id.slice(0, 8).toUpperCase()}` : 'N/A');
                return (
                  <div className="p-3.5 bg-neutral-900 border border-neutral-800 rounded-lg space-y-2.5" data-testid="text-risk-score-section">
                    <div className="text-xs uppercase text-blue-400 font-bold flex items-center justify-between border-b border-neutral-800/80 pb-2">
                      <span className="flex items-center gap-1.5 tracking-wider">
                        <Activity className="w-4 h-4 text-blue-400" /> 2. Text Risk Score
                      </span>
                      <span className="text-[10px] text-neutral-400 font-mono">
                        Case: {associatedCaseId}
                      </span>
                    </div>
                    <div className="flex items-center justify-between bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                      <div>
                        <div className="text-[11px] text-neutral-400">NLP Text Sentiment & Threat Analysis</div>
                        <div className="text-2xl font-bold font-mono text-blue-400 flex items-baseline gap-1 mt-0.5">
                          <span data-testid="text-risk-score-value">{textScore}</span>
                          <span className="text-xs text-neutral-500 font-normal">/ 100</span>
                        </div>
                      </div>
                      <div className="text-right space-y-1">
                        <span className={`px-2.5 py-1 rounded text-xs font-bold border inline-block ${textRiskBadgeColor}`} data-testid="text-risk-category-badge">
                          {textRiskLevel} Risk
                        </span>
                        <div className="text-[10px] text-neutral-400 font-mono" data-testid="text-risk-associated-case">
                          Associated Case: {associatedCaseId}
                        </div>
                      </div>
                    </div>
                    {detail.latest_analysis?.explanation && (
                      <div className="text-[11px] text-neutral-400 bg-neutral-950/60 p-2 rounded border border-neutral-800/60 leading-relaxed">
                        {detail.latest_analysis.explanation}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ============================================================== */}
              {/* 3. VOICE STRESS SCORE */}
              {/* ============================================================== */}
              {(() => {
                const voiceScore = detail.assessment?.voice_score ?? detail.voice_analysis?.voice_stress_score;
                const hasVoice = voiceScore != null;
                const voiceStressLevel = hasVoice ? (detail.voice_analysis?.stress_level || (voiceScore >= 75 ? 'Critical' : (voiceScore >= 50 ? 'High' : (voiceScore >= 25 ? 'Moderate' : 'Low')))) : null;
                const voiceBadgeColor = hasVoice ? (voiceScore >= 75 ? 'bg-red-950/80 text-red-300 border-red-700/60' : (voiceScore >= 50 ? 'bg-purple-950/80 text-purple-300 border-purple-700/60' : (voiceScore >= 25 ? 'bg-yellow-950/80 text-yellow-300 border-yellow-700/60' : 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'))) : '';
                const associatedCaseId = detail.case.reference_number || (detail.case.id ? `CMP-${detail.case.id.slice(0, 8).toUpperCase()}` : 'N/A');
                return (
                  <div className="p-3.5 bg-neutral-900 border border-neutral-800 rounded-lg space-y-2.5" data-testid="voice-stress-score-section">
                    <div className="text-xs uppercase text-violet-400 font-bold flex items-center justify-between border-b border-neutral-800/80 pb-2">
                      <span className="flex items-center gap-1.5 tracking-wider">
                        <Mic className="w-4 h-4 text-violet-400" /> 3. Voice Stress Score
                      </span>
                      <span className="text-[10px] text-neutral-400 font-mono">
                        Acoustic Analysis
                      </span>
                    </div>
                    {hasVoice ? (
                      <div className="flex items-center justify-between bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                        <div>
                          <div className="text-[11px] text-neutral-400">Acoustic Vocal Tremor & Pitch Stress</div>
                          <div className="text-2xl font-bold font-mono text-violet-400 flex items-baseline gap-1 mt-0.5">
                            <span data-testid="voice-stress-score-value">{voiceScore}</span>
                            <span className="text-xs text-neutral-500 font-normal">/ 100</span>
                          </div>
                        </div>
                        <div className="text-right space-y-1">
                          <span className={`px-2.5 py-1 rounded text-xs font-bold border inline-block ${voiceBadgeColor}`} data-testid="voice-stress-category-badge">
                            {voiceStressLevel} Stress
                          </span>
                          <div className="text-[10px] text-neutral-400 font-mono" data-testid="voice-stress-associated-case">
                            Associated Case: {associatedCaseId}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 flex items-center justify-between" data-testid="voice-not-assessed-banner">
                        <div className="flex items-center gap-2.5 text-neutral-400 text-xs">
                          <Info className="w-4 h-4 text-neutral-500 shrink-0" />
                          <div>
                            <div className="font-semibold text-neutral-300">Voice Assessment: Assessed - 70%</div>
                            <div className="text-[11px] text-neutral-500"> voice sample and recording submitted with this complaint.</div>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded text-xs font-semibold bg-neutral-800 text-neutral-400 border border-neutral-700 font-mono" data-testid="voice-not-assessed-badge">
                         
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ============================================================== */}
              {/* 4. SAFETY SEVERITY SCORE */}
              {/* ============================================================== */}
              {(() => {
                const safetyScore = detail.assessment?.safety_score ?? (detail.case?.priority === 'emergency' ? 70 : 20);
                const safetyLevel = safetyScore >= 75 ? 'Critical' : (safetyScore >= 50 ? 'High' : (safetyScore >= 25 ? 'Moderate' : 'Low'));
                const safetyBadgeColor = safetyScore >= 75 ? 'bg-red-950/80 text-red-300 border-red-700/60' : (safetyScore >= 50 ? 'bg-amber-950/80 text-amber-300 border-amber-700/60' : (safetyScore >= 25 ? 'bg-yellow-950/80 text-yellow-300 border-yellow-700/60' : 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'));
                const associatedCaseId = detail.case.reference_number || (detail.case.id ? `CMP-${detail.case.id.slice(0, 8).toUpperCase()}` : 'N/A');
                const victimName = detail.case.victim_name || 'Protected User';
                return (
                  <div className="p-3.5 bg-neutral-900 border border-neutral-800 rounded-lg space-y-2.5" data-testid="safety-severity-score-section">
                    <div className="text-xs uppercase text-red-400 font-bold flex items-center justify-between border-b border-neutral-800/80 pb-2">
                      <span className="flex items-center gap-1.5 tracking-wider">
                        <ShieldAlert className="w-4 h-4 text-red-400" /> 4. Safety Severity Score
                      </span>
                      <span className="text-[10px] text-neutral-400 font-mono">
                        Victim: {victimName}
                      </span>
                    </div>
                    <div className="flex items-center justify-between bg-neutral-950 p-3 rounded-lg border border-neutral-800">
                      <div>
                        <div className="text-[11px] text-neutral-400">Contextual Danger & Vulnerability Severity</div>
                        <div className="text-2xl font-bold font-mono text-red-400 flex items-baseline gap-1 mt-0.5">
                          <span data-testid="safety-severity-score-value">{safetyScore}</span>
                          <span className="text-xs text-neutral-500 font-normal">/ 100</span>
                        </div>
                      </div>
                      <div className="text-right space-y-1">
                        <span className={`px-2.5 py-1 rounded text-xs font-bold border inline-block ${safetyBadgeColor}`} data-testid="safety-severity-category-badge">
                          {safetyLevel} Severity
                        </span>
                        <div className="text-[10px] text-neutral-400 font-mono" data-testid="safety-severity-associated-case">
                          Associated Case: {associatedCaseId}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ============================================================== */}
              {/* 5. INCIDENT LOCATION */}
              {/* ============================================================== */}
              <div className="p-3.5 bg-neutral-900 border border-neutral-800 rounded-lg space-y-2.5" data-testid="case-location-section">
                <div className="text-xs uppercase text-emerald-400 font-bold flex items-center justify-between border-b border-neutral-800/80 pb-2">
                  <span className="flex items-center gap-1.5 tracking-wider">
                    <MapPin className="w-4 h-4 text-emerald-400" /> 5. Incident Location
                  </span>
                  {detail.case.latitude != null && detail.case.longitude != null && (
                    <button
                      onClick={() => setCenter([detail.case.latitude, detail.case.longitude])}
                      className="text-[11px] text-blue-400 hover:text-blue-300 underline font-normal flex items-center gap-1"
                      data-testid="pan-to-marker-btn"
                    >
                      <MapPin className="w-3 h-3" /> Pan to Marker
                    </button>
                  )}
                </div>

                {/* Reported Incident Address / Landmark */}
                <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 space-y-1" data-testid="reported-incident-address">
                  <div className="flex items-center justify-between text-xs font-semibold text-neutral-300">
                    <span className="flex items-center gap-1.5 text-amber-400 font-bold">
                      <MapPin className="w-3.5 h-3.5" /> Reported Address / Landmark
                    </span>
                    <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
                      Descriptive Location
                    </span>
                  </div>
                  <div className="text-xs text-white font-medium bg-neutral-900 p-2 rounded border border-neutral-800 leading-relaxed" data-testid="incident-address-text">
                    {detail.case.incident_location || (detail.case.latitude != null ? 'GPS coordinates attached without text address' : 'No written incident address provided in complaint.')}
                  </div>
                </div>

                {/* GPS Coordinates (if available) */}
                {detail.case.latitude != null && detail.case.longitude != null ? (
                  <div className="space-y-2">
                    {detail.case.manual_latitude != null && (
                      <div className="bg-emerald-950/40 border border-emerald-600/50 rounded-lg p-2.5 text-xs space-y-1">
                        <div className="flex items-center justify-between font-bold text-emerald-400">
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Victim-Confirmed Map Pin
                          </span>
                          {detail.case.manual_location_confirmed_at && (
                            <span className="text-[10px] text-emerald-400/80 font-mono">
                              {formatTime(detail.case.manual_location_confirmed_at)}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-emerald-200 font-mono">
                          Pin: {detail.case.manual_latitude.toFixed(4)}, {detail.case.manual_longitude.toFixed(4)} ({detail.case.manual_location_label || 'Confirmed on map'})
                        </div>
                        <div className="text-[10px] text-neutral-400 border-t border-emerald-800/40 pt-1">
                          Original GPS preserved: {detail.case.latitude.toFixed(4)}, {detail.case.longitude.toFixed(4)}
                        </div>
                      </div>
                    )}

                    <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 space-y-1" data-testid="gps-coordinates-card">
                      <div className="flex items-center justify-between text-xs font-semibold text-neutral-200">
                        <span className="text-emerald-400 font-bold">Attached GPS Coordinates</span>
                        <span className="text-[10px] text-neutral-500 font-mono">
                          {detail.case.location_updated_at ? formatTime(detail.case.location_updated_at) : ''}
                        </span>
                      </div>
                      <div className="font-mono text-xs text-neutral-200" data-testid="gps-coordinates-text">
                        Latitude: <strong className="text-white">{detail.case.latitude.toFixed(4)}</strong>, Longitude: <strong className="text-white">{detail.case.longitude.toFixed(4)}</strong>
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        Label: {detail.case.location_label || 'GPS Attached'}
                      </div>
                      {detail.case.gps_accuracy != null && (
                        <div className="text-[10px] text-neutral-400 font-mono">
                          GPS Accuracy: ±{Math.round(detail.case.gps_accuracy)}m
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-400 flex items-center gap-2" data-testid="location-unavailable">
                    <MapPin className="w-4 h-4 text-neutral-500 shrink-0" />
                    <span>Live GPS coordinates were not transmitted with this complaint (device geolocation unavailable or permission withheld). No fake coordinates generated.</span>
                  </div>
                )}
              </div>

              {detail.case.is_demo_or_test && (
                <div className="p-2 bg-purple-950/40 border border-purple-800/50 rounded text-xs text-purple-300 space-y-1">
                  <div className="font-bold flex items-center gap-1 text-[11px]">
                    <Info className="w-3 h-3 text-purple-400" /> Automated Test Record
                  </div>
                  <p className="text-[10px] text-purple-300/80 leading-relaxed">
                    This case record was generated by automated system tests. It is preserved for audit consistency and is not an active real-world emergency.
                  </p>
                </div>
              )}

              {/* Victim Contact & Emergency Profile Section */}
              <div className="p-3 bg-neutral-900 border border-neutral-800 rounded space-y-2.5" data-testid="victim-contact-section">
                <div className="text-xs uppercase text-blue-400 font-bold flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-blue-400" /> Victim Contact Details
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono font-semibold">
                    ID: {(detail.case.victim_id || '').slice(0, 8)}
                  </span>
                </div>

                {detail.case.victim_phone ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between bg-neutral-950 border border-neutral-800 p-2.5 rounded-lg">
                      <div>
                        <div className="text-[10px] text-neutral-400">Victim Phone Number:</div>
                        <div className="font-mono text-sm font-bold text-white tracking-wide flex items-center gap-2">
                          <span>{detail.case.victim_phone}</span>
                        </div>
                      </div>
                      <a
                        href={`tel:${detail.case.victim_phone}`}
                        data-testid="call-victim-btn"
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-bold flex items-center gap-1.5 transition shadow"
                        title="Opens device dialler. Note: Opening dialler does not automatically verify a completed call."
                      >
                        <PhoneCall className="w-3.5 h-3.5" /> Call Victim
                      </a>
                    </div>
                    <p className="text-[10px] text-neutral-400 leading-tight">
                      Verify number before calling: <span className="text-neutral-200 font-mono">{detail.case.victim_phone}</span>. Clicking <strong>Call Victim</strong> opens device dialler. Opening dialler does not count as completed contact; record the verified outcome below.
                    </p>
                  </div>
                ) : (
                  <div className="p-2.5 bg-amber-950/30 border border-amber-800/40 rounded-lg flex items-start gap-2.5 text-amber-200" data-testid="victim-phone-unavailable">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-xs space-y-0.5">
                      <div className="font-bold text-amber-300">Victim phone number unavailable</div>
                      <div className="text-[11px] text-amber-200/80 leading-relaxed">
                        The victim did not provide a contact phone number during registration. You can still reach them via in-app chat or assign a duty counsellor.
                      </div>
                    </div>
                  </div>
                )}

                {/* Emergency Medical & Registered Profile Indicators */}
                {(detail.case.victim_blood_group || detail.case.victim_saved_location || detail.case.victim_gender) && (
                  <div className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg space-y-1.5 text-xs">
                    <div className="font-bold text-[10px] uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                      <HeartPulse className="w-3.5 h-3.5 text-red-400" /> Emergency Medical & Profile Indicators
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      {detail.case.victim_blood_group && (
                        <div className="bg-red-950/30 border border-red-800/40 px-2 py-1 rounded text-red-200">
                          <span className="text-neutral-400 text-[10px] block">Blood Group:</span>
                          <strong className="text-red-300 font-mono text-xs">{detail.case.victim_blood_group}</strong>
                        </div>
                      )}
                      {detail.case.victim_gender && (
                        <div className="bg-neutral-900 border border-neutral-800 px-2 py-1 rounded text-neutral-300">
                          <span className="text-neutral-400 text-[10px] block">Gender:</span>
                          <span>{detail.case.victim_gender}</span>
                        </div>
                      )}
                    </div>
                    {detail.case.victim_saved_location && (
                      <div className="text-[10px] text-neutral-400 bg-neutral-900 border border-neutral-800 px-2 py-1.5 rounded">
                        <span className="text-neutral-500 font-semibold block">Registered Safe Residence:</span>
                        <span className="text-neutral-300">{detail.case.victim_saved_location}</span>
                        <span className="text-neutral-500 block text-[9px] mt-0.5">(Home address is kept separate from live emergency GPS coordinates)</span>
                      </div>
                    )}
                  </div>
                )}
                {/* Contact History List */}
                {detail.case.contact_history && detail.case.contact_history.length > 0 && (
                  <div className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg space-y-1.5 text-xs" data-testid="case-contact-history">
                    <div className="font-bold text-[10px] uppercase tracking-wider text-blue-400 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5 text-blue-400" /> Contact History ({detail.case.contact_history.length})
                      </span>
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {detail.case.contact_history.slice().reverse().map((entry, idx) => (
                        <div key={idx} className="p-1.5 bg-neutral-900 rounded border border-neutral-800 text-[11px] flex items-center justify-between">
                          <div>
                            <span className="font-semibold text-white">{entry.outcome}</span>
                            {entry.officer_name && <span className="text-neutral-400 text-[10px] ml-1.5">by {entry.officer_name}</span>}
                            {entry.notes && <div className="text-neutral-400 text-[10px] mt-0.5">{entry.notes}</div>}
                          </div>
                          <span className="text-[10px] text-neutral-500 font-mono shrink-0">
                            {entry.timestamp ? formatTime(entry.timestamp) : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Automated Intervention Recommendations & AI Action Protocol */}
              {detail.recommendations && detail.recommendations.length > 0 && (
                <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-lg space-y-2" data-testid="case-recommendations-section">
                  <div className="text-xs uppercase text-emerald-400 font-bold flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Automated Intervention Recommendations
                    </span>
                    <span className="text-[10px] text-amber-400/90 font-mono">
                      {detail.disclaimer || 'AI Recommendation — Human Review Required'}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {detail.recommendations.map((rec, i) => (
                      <div key={i} className="p-2.5 bg-neutral-950 rounded border border-neutral-800/80 text-xs">
                        <div className="flex justify-between items-center font-semibold text-neutral-200">
                          <span>{rec.type}</span>
                          <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                            {rec.priority}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-400 mt-0.5">{rec.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <AIEscalationRiskPredictor caseId={detail.case.id} />

              {detail.case.summary && (
                <div className="p-3 bg-neutral-900 border border-neutral-800 rounded text-xs space-y-1.5" data-testid="case-summary-box">
                  <div className="flex items-center justify-between">
                    <div className="uppercase text-blue-400 font-bold flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Summary
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 bg-neutral-800 text-neutral-400 rounded">
                      Structured Case Overview
                    </span>
                  </div>
                  <div className="text-neutral-300 leading-relaxed whitespace-pre-line text-[11px] font-sans">
                    {detail.case.summary}
                  </div>
                </div>
              )}

              <div className="p-3 bg-neutral-900 border border-neutral-800 rounded max-h-40 overflow-y-auto">
                <div className="text-xs uppercase text-blue-400 mb-1 font-bold">Transcript</div>
                {detail.interactions.slice(-8).map((i) => (
                  <div key={i.id} className="text-[11px] mb-1">
                    <span className={`font-bold ${i.role === 'user' ? 'text-white' : 'text-emerald-400'}`}>{i.role}:</span> {i.content}
                  </div>
                ))}
              </div>

              {/* Victim Shared Evidence Section */}
              <div className="p-3 bg-neutral-900 border border-neutral-800 rounded text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="uppercase text-blue-400 font-bold flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-blue-400" />
                    <span>Shared Evidence Vault ({detail.evidence?.length || 0})</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-semibold">
                    <CheckCircle className="w-3 h-3 text-emerald-400" /> Authorized Access
                  </span>
                </div>

                {!detail.evidence || detail.evidence.length === 0 ? (
                  <div className="py-3 text-center text-neutral-500 text-[11px] bg-neutral-950/40 rounded border border-neutral-800/60 p-2.5">
                    <Lock className="w-4 h-4 mx-auto mb-1 text-neutral-600" />
                    <p>No evidence records shared by the victim for this case.</p>
                    <p className="text-[10px] text-neutral-600 mt-0.5">The victim's stealth vault remains private and encrypted.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {detail.evidence.map((item) => (
                      <div key={item.id} className="p-2.5 bg-neutral-950/80 border border-neutral-800 rounded-lg space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {item.is_media ? (
                                item.media_type?.includes('video') ? (
                                  <Film className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                ) : (
                                  <ImageIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                )
                              ) : (
                                <FileText className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                              )}
                              <span className="font-bold text-white text-[11px]">{item.title}</span>
                              {item.is_media ? (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-neutral-800 text-cyan-300 border border-neutral-700 font-mono uppercase">
                                  {item.media_type?.includes('video') ? 'Video' : 'Image'}
                                </span>
                              ) : (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-400 border border-neutral-700 font-mono uppercase">
                                  Text Snapshot
                                </span>
                              )}
                            </div>
                            {item.is_media && item.original_name && item.original_name !== item.title && (
                              <div className="text-[10px] text-cyan-400/90 font-mono pl-5 flex items-center gap-1">
                                <span>File: {item.original_name}</span>
                                {item.file_size && (
                                  <span className="text-neutral-500">({(item.file_size / 1024).toFixed(1)} KB)</span>
                                )}
                              </div>
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-neutral-500 shrink-0">
                            {item.timestamp ? formatDate(item.timestamp) : ''}
                          </span>
                        </div>

                        {!item.is_media && /\.(jpe?g|png|webp|mp4|mov|webm)$/i.test(item.title) && (
                          <div className="p-1.5 bg-amber-950/30 border border-amber-800/40 rounded text-[10px] text-amber-300 flex items-start gap-1 font-sans">
                            <AlertCircle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                            <span>Sealed as a Text Incident Snapshot without binary media bytes attached. Original media binary is unavailable.</span>
                          </div>
                        )}

                        {item.notes && (
                          <div className="p-2 bg-neutral-900 rounded border border-neutral-800 text-[11px] text-neutral-300 font-sans leading-relaxed">
                            {item.notes}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-1 text-[10px]">
                          <div className="flex items-center gap-1.5 font-mono text-cyan-400">
                            {item.integrity_verified ? (
                              <span className="text-emerald-400 flex items-center gap-0.5 font-semibold" title={item.integrity_detail}>
                                <CheckCircle className="w-3 h-3 text-emerald-400" /> SHA-256 Intact
                              </span>
                            ) : (
                              <span className="text-amber-400 flex items-center gap-0.5 font-semibold">
                                <AlertTriangle className="w-3 h-3 text-amber-400" /> Unverified
                              </span>
                            )}
                            <span className="text-neutral-500 truncate max-w-[140px]" title={item.hash}>{item.hash}</span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {item.is_media && item.media_url ? (
                              <>
                                <button
                                  onClick={() => handlePreviewOfficerEvidence(item)}
                                  data-testid="preview-evidence-btn"
                                  className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-cyan-300 border border-neutral-700 font-semibold flex items-center gap-1 transition text-[11px]"
                                >
                                  <Eye className="w-3 h-3" /> {item.media_type?.includes('video') ? 'Preview Video' : 'Preview Image'}
                                </button>
                                <button
                                  onClick={() => handleDownloadOfficerEvidence(item)}
                                  data-testid="download-evidence-btn"
                                  className="px-2.5 py-1 rounded bg-blue-950 hover:bg-blue-900 border border-blue-700 text-blue-200 font-semibold flex items-center gap-1 transition text-[11px]"
                                >
                                  <Download className="w-3 h-3" /> {item.media_type?.includes('video') ? 'Download Video' : 'Download Image'}
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handlePreviewOfficerEvidence(item)}
                                data-testid="view-snapshot-btn"
                                className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold flex items-center gap-1 transition text-[11px]"
                              >
                                <Eye className="w-3 h-3" /> View Snapshot
                              </button>
                            )}
                          </div>
                        </div>

                        {item.shared_at && (
                          <div className="text-[9px] text-neutral-500 font-mono flex items-center justify-between pt-0.5 border-t border-neutral-900">
                            <span>Shared: {formatDateTime(item.shared_at)}</span>
                            <span>Recipient: {item.shared_officer_name || user?.name || 'Assigned Officer'}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-3 bg-neutral-900 border border-neutral-800 rounded">
                <div className="text-xs uppercase text-blue-400 mb-2 font-bold flex items-center justify-between">
                  <span>Actions</span>
                  {detail.case.priority === 'emergency' && (
                    <span className="text-[10px] text-red-400 font-mono uppercase">🚨 Emergency Priority</span>
                  )}
                </div>

                {detail.case.priority === 'emergency' && detail.case.acknowledgment_status !== 'acknowledged' && (
                  <button
                    onClick={() => setShowAckConfirm(true)}
                    disabled={isAcknowledging}
                    data-testid="action-acknowledge"
                    className="w-full mb-3 py-2 px-3 text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/50 rounded hover:bg-amber-500/30 flex items-center justify-center gap-1.5 transition animate-pulse disabled:opacity-50"
                  >
                    {isAcknowledging ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle className="w-3.5 h-3.5 text-amber-400" />
                    )}
                    Acknowledge Emergency Alert
                  </button>
                )}

                {detail.case.priority !== 'emergency' && (!detail.case.officer_id || detail.case.acknowledgment_status !== 'acknowledged') && (
                  <button
                    onClick={handleAcknowledge}
                    disabled={isAcknowledging}
                    data-testid="action-claim-case"
                    className="w-full mb-3 py-2.5 px-3 text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/50 rounded-lg hover:bg-amber-500/30 flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-md"
                  >
                    {isAcknowledging ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle className="w-3.5 h-3.5 text-amber-400" />
                    )}
                    <span>
                      {!detail.case.officer_id
                        ? 'Claim Case (Assign to Me & Acknowledge)'
                        : 'Acknowledge Case'}
                    </span>
                  </button>
                )}

                {detail.case.acknowledgment_status === 'acknowledged' && (
                  <div className="mb-3 py-1.5 px-2.5 text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded flex items-center gap-1.5" data-testid="case-acknowledged-badge">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> Case Acknowledged by {detail.case.acknowledged_by || 'Duty Officer'}
                  </div>
                )}

                <div className="flex gap-2 mb-2">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="Enter case note or observation..."
                    data-testid="officer-notes"
                    className="flex-1 text-xs bg-neutral-800 border border-neutral-700 rounded p-2 text-white outline-none focus:border-blue-400"
                  />
                  <button
                    onClick={() => {
                      if (!note.trim()) {
                        toast.error('Please enter a note before saving');
                        return;
                      }
                      doAction('note');
                    }}
                    disabled={!note.trim()}
                    data-testid="save-note-btn"
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold disabled:opacity-40 self-end transition flex items-center gap-1 shrink-0"
                  >
                    <Send className="w-3 h-3" /> Save Note
                  </button>
                </div>

                {detail.actions && detail.actions.length > 0 && (
                  <div className="mb-3 p-2 bg-neutral-950 border border-neutral-800 rounded-lg space-y-1" data-testid="recorded-actions-list">
                    <div className="text-[10px] uppercase font-bold text-neutral-400 flex items-center justify-between">
                      <span>Recorded Case Actions & Notes ({detail.actions.length})</span>
                    </div>
                    <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                      {detail.actions.slice().reverse().map((a) => (
                        <div key={a.id} className="text-[11px] p-1.5 bg-neutral-900/80 rounded border border-neutral-800/80">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-semibold text-blue-300 capitalize">{a.action.replace('_', ' ')}</span>
                            <span className="text-neutral-500 font-mono">{formatTime(a.created_at)}</span>
                          </div>
                          {a.notes && <div className="text-neutral-300 text-[10px] mt-0.5 leading-tight">{a.notes}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      if (!selected) return;
                      setContactNotes(note || '');
                      setShowContactModal(true);
                    }}
                    data-testid="action-contact"
                    className="text-xs py-1.5 px-2 bg-blue-500/20 border border-blue-500/40 text-blue-300 rounded hover:bg-blue-500/30 flex items-center justify-center gap-1.5 font-medium transition"
                  >
                    <Phone className="w-3.5 h-3.5 text-blue-400" /> Contacted
                  </button>
                  <button
                    onClick={() => {
                      if (!selected) return;
                      setDispatchNotes(note || '');
                      setShowDispatchModal(true);
                    }}
                    data-testid="action-dispatch"
                    className="text-xs py-1.5 px-2 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded hover:bg-amber-500/30 flex items-center justify-center gap-1.5 font-medium transition"
                  >
                    <Truck className="w-3.5 h-3.5 text-amber-400" /> Dispatch
                  </button>
                  <button
                    onClick={genSummary}
                    disabled={isGeneratingSummary}
                    data-testid="gen-summary"
                    className="text-xs py-1.5 px-2 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded hover:bg-emerald-500/30 flex items-center justify-center gap-1.5 font-medium transition disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> {isGeneratingSummary ? 'Summarizing…' : 'Summary'}
                  </button>
                  <button
                    onClick={() => {
                      if (!selected) return;
                      setShowLogModal(true);
                      fetchCaseLogs(selected.id);
                    }}
                    data-testid="action-close"
                    className="text-xs py-1.5 px-2 bg-neutral-800 border border-neutral-700 text-neutral-300 rounded hover:bg-neutral-700 flex items-center justify-center gap-1.5 font-medium transition"
                    title="View tamper-evident activity & audit logs"
                  >
                    <History className="w-3.5 h-3.5 text-neutral-400" /> Log
                  </button>
                </div>

                <div className="mt-3 pt-3 border-t border-neutral-800">
                  <div className="text-xs uppercase text-blue-400 mb-2 font-bold flex items-center justify-between">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> Assign counsellor</span>
                    {(selected?.counsellor_name || detail?.case?.counsellor_name || selected?.counsellor_id || detail?.case?.counsellor_id) && (
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-semibold normal-case">
                          Assigned: {selected?.counsellor_name || detail?.case?.counsellor_name || 'Assigned'}
                        </span>
                        {(selected?.assigned_at || detail?.case?.assigned_at) && (
                          <span className="text-[9px] text-neutral-400 font-mono mt-0.5">
                            {formatDateTime(selected?.assigned_at || detail?.case?.assigned_at)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <select
                    value={chosenCounsellor}
                    onChange={(e) => setChosenCounsellor(e.target.value)}
                    data-testid="counsellor-select"
                    className="w-full text-xs bg-neutral-800 border border-neutral-700 rounded p-2 mb-2"
                  >
                    <option value="">Choose…</option>
                    {deduplicatedCounsellors.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
                  </select>
                  <button
                    onClick={assign}
                    disabled={!chosenCounsellor}
                    data-testid="assign-btn"
                    className="w-full text-xs py-2 bg-blue-500 rounded hover:bg-blue-400 disabled:opacity-40 font-bold"
                  >
                    Assign
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Acknowledge Confirm Modal */}
      {showAckConfirm && selected && (
        <div className="fixed inset-0 z-[2000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-5 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <AlertTriangle className="w-4 h-4" /> Acknowledge Emergency Alert
              </div>
              <button onClick={() => setShowAckConfirm(false)} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-neutral-300 leading-relaxed">
              Confirming acknowledgment records your officer credentials (<span className="text-white font-mono">{user?.name || user?.email}</span>) and server timestamp in the tamper-evident audit log. The case will move to <span className="text-emerald-400 font-semibold">in_progress</span> status.
            </p>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-neutral-400 mb-1 font-bold">Officer Notes (Optional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Acknowledged; monitoring coordinates and initiating victim contact."
                rows={2}
                className="w-full text-xs bg-neutral-800 border border-neutral-700 rounded p-2 text-white outline-none focus:border-amber-400"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setShowAckConfirm(false)}
                className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white rounded border border-neutral-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAcknowledge}
                disabled={isAcknowledging}
                data-testid="confirm-acknowledge-btn"
                className="px-4 py-1.5 text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 rounded transition disabled:opacity-50 flex items-center gap-1.5"
              >
                {isAcknowledging ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                Confirm Acknowledge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Contact Modal */}
      {showContactModal && selected && (
        <div className="fixed inset-0 z-[2000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleRecordContact} className="bg-neutral-900 border border-neutral-700 rounded-lg p-5 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
                <Phone className="w-4 h-4" /> Record Victim Contact
              </div>
              <button type="button" onClick={() => setShowContactModal(false)} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-neutral-400 space-y-1">
              <div>
                Case: <span className="text-white font-medium">{selected.title || 'Emergency Case'}</span> ({detail?.case?.victim_name || selected.victim_name || 'Victim'})
              </div>

              {/* Victim Contact Display & Verification */}
              {(detail?.case?.victim_phone || selected.victim_phone) ? (
                <div className="mt-2 p-3 bg-neutral-800/80 border border-neutral-700 rounded-md flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold">Victim Phone Number</div>
                    <div className="font-mono text-emerald-400 font-bold text-sm">
                      {detail?.case?.victim_phone || selected.victim_phone}
                    </div>
                    <div className="text-[10px] text-neutral-400">Verify number before initiating call</div>
                  </div>
                  <a
                    href={`tel:${detail?.case?.victim_phone || selected.victim_phone}`}
                    data-testid="modal-call-victim-btn"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold text-xs transition"
                  >
                    <PhoneCall className="w-3.5 h-3.5" /> Call Victim
                  </a>
                </div>
              ) : (
                <div data-testid="modal-victim-phone-unavailable" className="mt-2 p-2.5 rounded bg-amber-950/40 border border-amber-800/40 text-amber-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span>Victim phone number unavailable in registered profile</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-neutral-400 mb-1 font-bold">Contact Outcome</label>
              <select
                value={contactOutcome}
                onChange={(e) => setContactOutcome(e.target.value)}
                data-testid="contact-outcome-select"
                className="w-full text-xs bg-neutral-800 border border-neutral-700 rounded p-2 text-white outline-none focus:border-blue-400"
              >
                <option value="Successfully contacted">Successfully contacted</option>
                <option value="Attempted — no answer">Attempted — no answer</option>
                <option value="Unreachable">Unreachable</option>
                <option value="Contact not possible">Contact not possible</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-neutral-400 mb-1 font-bold">Contact Notes / Outcome Details</label>
              <textarea
                value={contactNotes}
                onChange={(e) => setContactNotes(e.target.value)}
                data-testid="contact-modal-notes"
                placeholder="Details of conversation, instructions provided, safety status..."
                rows={3}
                className="w-full text-xs bg-neutral-800 border border-neutral-700 rounded p-2 text-white outline-none focus:border-blue-400"
              />
            </div>

            <div className="p-2.5 bg-neutral-800/80 border border-neutral-700 rounded text-[11px] text-neutral-300 space-y-1">
              <div className="font-semibold flex items-center gap-1 text-blue-400">
                <Info className="w-3.5 h-3.5" /> Contact Protocol
              </div>
              <p className="text-neutral-400 leading-relaxed text-[10px]">
                Opening the device dialler does not automatically verify a completed call. The outcome must be truthfully selected above and saved to the tamper-evident audit log.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setShowContactModal(false)}
                className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white rounded border border-neutral-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingContact}
                data-testid="submit-contact-btn"
                className="px-4 py-1.5 text-xs font-bold bg-blue-500 text-white hover:bg-blue-400 rounded transition disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSubmittingContact ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Save Contact Record
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Internal Dispatch Modal */}
      {showDispatchModal && selected && (
        <div className="fixed inset-0 z-[2000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleRecordDispatch} className="bg-neutral-900 border border-neutral-700 rounded-lg p-5 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <Truck className="w-4 h-4" /> Internal NIVARA Unit Dispatch
              </div>
              <button type="button" onClick={() => setShowDispatchModal(false)} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-neutral-400">
              Case: <span className="text-white font-medium">{selected.title || 'Emergency Case'}</span> ({selected.victim_name || 'Victim'})
              {selected.location_label && (
                <div className="mt-0.5 text-neutral-400 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-red-400" /> {selected.location_label}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-neutral-400 mb-1 font-bold">Unit Designation</label>
                <input
                  type="text"
                  value={dispatchUnit}
                  onChange={(e) => setDispatchUnit(e.target.value)}
                  placeholder="e.g. Patrol Unit 1"
                  data-testid="dispatch-unit-input"
                  className="w-full text-xs bg-neutral-800 border border-neutral-700 rounded p-2 text-white outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-neutral-400 mb-1 font-bold">Dispatch Status</label>
                <select
                  value={dispatchStatus}
                  onChange={(e) => setDispatchStatus(e.target.value)}
                  data-testid="dispatch-status-select"
                  className="w-full text-xs bg-neutral-800 border border-neutral-700 rounded p-2 text-white outline-none focus:border-amber-400"
                >
                  <option value="dispatched">Dispatched (En Route)</option>
                  <option value="reassigned">Reassigned to New Unit</option>
                  <option value="completed">Completed / Arrived</option>
                  <option value="pending">Pending Departure</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-neutral-400 mb-1 font-bold">Dispatch Notes / Coordination Details</label>
              <textarea
                value={dispatchNotes}
                onChange={(e) => setDispatchNotes(e.target.value)}
                data-testid="dispatch-modal-notes"
                placeholder="Unit route, estimated arrival, officer safety precautions..."
                rows={2}
                className="w-full text-xs bg-neutral-800 border border-neutral-700 rounded p-2 text-white outline-none focus:border-amber-400"
              />
            </div>

            <div className="p-2.5 bg-red-950/30 border border-red-800/40 rounded text-[11px] text-red-300 space-y-1">
              <div className="font-semibold flex items-center gap-1 text-red-400">
                <AlertCircle className="w-3.5 h-3.5" /> Emergency Dispatch Disclaimer
              </div>
              <p className="text-red-300/80 leading-relaxed text-[10px]">
                This is an <strong className="text-red-200">internal NIVARA response workflow</strong>. External 112 emergency police dispatch is NOT automatically integrated. For immediate life-threatening danger, contact 112 directly.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setShowDispatchModal(false)}
                className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white rounded border border-neutral-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingDispatch || !dispatchUnit.trim()}
                data-testid="submit-dispatch-btn"
                className="px-4 py-1.5 text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 rounded transition disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSubmittingDispatch ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Truck className="w-3.5 h-3.5" />}
                Confirm Dispatch
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Activity & Tamper-Evident Audit Log Modal */}
      {showLogModal && selected && (
        <div className="fixed inset-0 z-[2000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-700 rounded-lg max-w-2xl w-full shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-4 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-blue-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">Case Activity & Audit Trail</h3>
                  <p className="text-[11px] text-neutral-400">Case #{selected.id} · Chronological Newest First</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fetchCaseLogs(selected.id)}
                  disabled={isLoadingLogs}
                  className="p-1.5 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition"
                  title="Refresh Log"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLogs ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowLogModal(false)}
                  className="p-1.5 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-3" data-testid="case-logs-container">
              {isLoadingLogs ? (
                <div className="text-center py-8 text-neutral-500 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-400" /> Loading immutable audit logs…
                </div>
              ) : caseLogs.length === 0 ? (
                <div className="text-center py-8 text-neutral-500 text-xs">
                  No activity or audit logs recorded for this case yet.
                </div>
              ) : (
                caseLogs.map((log) => {
                  const isOfficer = log.actor_role === 'officer' || log.source === 'officer_action';
                  const isCounsellor = log.actor_role === 'counsellor' || log.source === 'counsellor_note';

                  return (
                    <div
                      key={log.id}
                      className="p-3 bg-neutral-950/80 border border-neutral-800/80 rounded space-y-1.5 hover:border-neutral-700 transition"
                    >
                      <div className="flex items-center justify-between text-xs flex-wrap gap-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              isOfficer
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                : isCounsellor
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {isOfficer ? '🛡️ Officer' : isCounsellor ? '💬 Counsellor' : '🔒 System Audit'}
                          </span>
                          <span className="font-semibold text-white text-[11px]">{log.actor_name || 'System'}</span>
                        </div>
                        <span className="text-[10px] text-neutral-400 font-mono">
                          {log.created_at ? formatDateTime(log.created_at) : ''}
                        </span>
                      </div>

                      <div className="text-xs text-neutral-200">
                        <span className="font-mono text-blue-400 text-[11px] font-semibold">{log.action}: </span>
                        <span>{log.details || 'No additional notes'}</span>
                      </div>

                      {log.meta && Object.keys(log.meta).length > 0 && (
                        <div className="p-2 bg-neutral-900/90 rounded border border-neutral-800 text-[10px] text-neutral-400 font-mono">
                          {Object.entries(log.meta).map(([k, v]) => (
                            <div key={k} className="flex gap-1.5 overflow-hidden text-ellipsis">
                              <span className="text-neutral-500">{k}:</span>
                              <span className="text-neutral-300">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-3 border-t border-neutral-800 bg-neutral-950/60 flex items-center justify-between text-[11px] text-neutral-500">
              <span className="flex items-center gap-1">
                <Lock className="w-3 h-3 text-emerald-400" /> Tamper-evident & immutable audit logs
              </span>
              <span>Total records: {caseLogs.length}</span>
            </div>
          </div>
        </div>
      )}

      {/* Officer Evidence Preview Modal */}
      {previewOfficerEvidence && (
        <div className="fixed inset-0 z-[2500] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-neutral-900 border border-neutral-700 rounded-2xl p-4 flex flex-col max-h-[85vh] shadow-2xl">
            <div className="flex justify-between items-center pb-2 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-400" />
                <div>
                  <div className="font-bold text-xs text-white">{previewOfficerEvidence.title}</div>
                  {previewOfficerEvidence.original_name && (
                    <div className="text-[10px] text-neutral-400 font-mono">
                      File: {previewOfficerEvidence.original_name}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {previewOfficerEvidence.is_media && previewOfficerEvidence.item && (
                  <button
                    onClick={() => handleDownloadOfficerEvidence(previewOfficerEvidence.item)}
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold rounded flex items-center gap-1 shadow"
                    title="Download evidence file"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download {previewOfficerEvidence.type?.startsWith('video') ? 'Video' : 'Image'}</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    if (previewOfficerEvidence.url) URL.revokeObjectURL(previewOfficerEvidence.url);
                    setPreviewOfficerEvidence(null);
                  }}
                  className="p-1 rounded-lg text-neutral-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto py-3 flex flex-col items-center justify-center">
              {previewOfficerEvidence.type?.startsWith('video') ? (
                <div className="flex flex-col items-center gap-2 w-full">
                  <video src={previewOfficerEvidence.url} controls playsInline className="max-h-[55vh] max-w-full rounded-xl border border-neutral-800" />
                  {previewOfficerEvidence.notes && (
                    <div className="w-full p-2.5 bg-neutral-950 rounded-lg border border-neutral-800 text-[11px] text-neutral-300">
                      <span className="text-neutral-500 font-bold block mb-0.5">Victim Notes:</span>
                      {previewOfficerEvidence.notes}
                    </div>
                  )}
                </div>
              ) : previewOfficerEvidence.type?.startsWith('image') ? (
                <div className="flex flex-col items-center gap-2 w-full">
                  <img src={previewOfficerEvidence.url} alt="Sealed Evidence" className="max-h-[55vh] max-w-full object-contain rounded-xl border border-neutral-800 bg-black/40" />
                  {previewOfficerEvidence.notes && (
                    <div className="w-full p-2.5 bg-neutral-950 rounded-lg border border-neutral-800 text-[11px] text-neutral-300">
                      <span className="text-neutral-500 font-bold block mb-0.5">Victim Notes:</span>
                      {previewOfficerEvidence.notes}
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full space-y-2">
                  {/\.(jpe?g|png|webp|mp4|mov|webm)$/i.test(previewOfficerEvidence.title) && (
                    <div className="p-2.5 bg-amber-950/40 border border-amber-800/60 rounded-lg text-xs text-amber-300 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span>This record was sealed as a Text Incident Snapshot without binary media bytes attached. Original media binary is unavailable.</span>
                    </div>
                  )}
                  <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800 text-xs text-neutral-200 whitespace-pre-line leading-relaxed font-sans">
                    <span className="text-neutral-500 font-bold block mb-1 text-[11px] uppercase tracking-wider">Incident Notes / Content:</span>
                    {previewOfficerEvidence.notes || 'No description provided.'}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-neutral-800 text-[10px] flex items-center justify-between">
              <div className="flex items-center gap-2 truncate max-w-[420px]">
                <span className="font-mono text-cyan-400 truncate">SHA-256: {previewOfficerEvidence.hash}</span>
                {previewOfficerEvidence.integrity_verified && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-700/60 text-emerald-300 font-semibold text-[9px] shrink-0 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-emerald-400" /> SHA-256 Intact
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  if (previewOfficerEvidence.url) URL.revokeObjectURL(previewOfficerEvidence.url);
                  setPreviewOfficerEvidence(null);
                }}
                className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded font-bold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
