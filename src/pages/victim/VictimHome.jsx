import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api, connectWS } from '@/lib/api';
import { t } from '@/lib/i18n';
import { toast } from 'sonner';
import { 
  Mic, MicOff, MessageCircle, AlertTriangle, ClipboardList, Bell, 
  Settings as SettingsIcon, LogOut, Send, X, Volume2, Shield, 
  EyeOff, Download, Sparkles, Activity, FileText, Lock, Globe, Flame,
  Radio, ShieldCheck, Camera, UserCheck, HeartPulse, Phone, MapPin, PhoneCall, Square
} from 'lucide-react';
import SVIBadge from '@/components/SVIBadge';
import VoiceConsentModal from '@/components/VoiceConsentModal';
import BiometricVoiceVisualizer from '@/components/BiometricVoiceVisualizer';
import SafeHavenRadar from '@/components/SafeHavenRadar';
import AISafetyPlanModal from '@/components/AISafetyPlanModal';
import EvidenceVaultModal from '@/components/EvidenceVaultModal';
import NotificationCenter from '@/components/NotificationCenter';
import VoiceAssistantModal from '@/components/VoiceAssistantModal';
import GuidedComplaintModal from '@/components/GuidedComplaintModal';
import { getUserLocation } from '@/lib/location';
import { isWebSpeechSupported, createLiveRecognizer, playBrowserTTS, stopAllBrowserSpeech } from '@/lib/speech';

const tabs = [
  { key: 'voice', icon: Mic, label: 'aiVoice' },
  { key: 'chat', icon: MessageCircle, label: 'aiChat' },
  { key: 'help', icon: AlertTriangle, label: 'immediateHelp' },
  { key: 'cases', icon: ClipboardList, label: 'caseStatus' },
  { key: 'follow', icon: Bell, label: 'followups' },
  { key: 'settings', icon: SettingsIcon, label: 'settings' },
];

const SAFE_WORDS = ['pineapple', 'red', 'mayday', 'help me now', 'emergency red'];

export default function VictimHome() {
  const { user, logout, lang, setLang, updateUser } = useAuth();
  const [tab, setTab] = useState('voice');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [caseId, setCaseId] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [thinkingHint, setThinkingHint] = useState('Nivara is listening carefully...');
  const [svi, setSvi] = useState({ score: 0, level: 'Low' });
  const [cases, setCases] = useState([]);
  const [activeEmergencyCase, setActiveEmergencyCase] = useState(null);

  // Victim Profile State
  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    gender: user?.gender || '',
    blood_group: user?.blood_group || '',
    saved_location: user?.saved_location || '',
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    if (user) {
      setProfileForm({
        name: user.name || '',
        phone: user.phone || '',
        gender: user.gender || '',
        blood_group: user.blood_group || '',
        saved_location: user.saved_location || '',
      });
    }
  }, [user]);

  const handleSaveProfile = async (e) => {
    if (e) e.preventDefault();
    setIsSavingProfile(true);
    try {
      const { data } = await api.put('/auth/me', {
        name: profileForm.name?.trim(),
        phone: profileForm.phone?.trim() || null,
        gender: profileForm.gender || null,
        blood_group: profileForm.blood_group || null,
        saved_location: profileForm.saved_location?.trim() || null,
        language: lang,
      });
      if (updateUser) updateUser(data);
      toast.success('Victim profile saved successfully');
    } catch (err) {
      toast.error('Failed to update profile: ' + (err.response?.data?.detail || err.message));
    } finally {
      setIsSavingProfile(false);
    }
  };
  const [followups, setFollowups] = useState([]);
  const [showSOS, setShowSOS] = useState(false);
  const [sosMsg, setSosMsg] = useState('');
  const [orbState, setOrbState] = useState('idle'); // idle | listening | thinking | speaking
  const [showVoiceConsentModal, setShowVoiceConsentModal] = useState(false);
  const [voiceConsentAnswered, setVoiceConsentAnswered] = useState(false);
  
  // Futuristic States & Modals
  const [suggestedReplies, setSuggestedReplies] = useState([
    "I need advice on safety",
    "Someone is following me",
    "How can I report this discreetly?"
  ]);
  const [isDisguised, setIsDisguised] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showRadarModal, setShowRadarModal] = useState(false);
  const [showSafetyPlanModal, setShowSafetyPlanModal] = useState(false);
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);
  const [showVoiceAssistantModal, setShowVoiceAssistantModal] = useState(false);
  const [showComplaintModal, setShowComplaintModal] = useState(false);
  const [complaintInitialText, setComplaintInitialText] = useState('');
  const [showLocationConsentModal, setShowLocationConsentModal] = useState(false);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [recognizedVoiceText, setRecognizedVoiceText] = useState('');
  const [recordingInline, setRecordingInline] = useState(false);
  const [langBanner, setLangBanner] = useState(null);
  const [detectedLang, setDetectedLang] = useState('en');
  const [counsellorOnline, setCounsellorOnline] = useState(null);

  const mediaRef = useRef(null);
  const inlineMediaRef = useRef(null);
  const chunksRef = useRef([]);
  const inlineChunksRef = useRef([]);
  const audioRef = useRef(new Audio());
  const currentSpeechSessionRef = useRef(0);
  const scrollRef = useRef(null);

  useEffect(() => {
    // Check existing voice consent
    api.get('/consent/voice').then((r) => {
      if (r.data && r.data.granted !== undefined) {
        setVoiceConsentAnswered(true);
      }
    }).catch(() => {});

    // Trigger Voice Onboarding on first visit
    const onboardingPlayed = localStorage.getItem('nivara_voice_onboarding_played');
    if (!onboardingPlayed) {
      triggerVoiceOnboarding();
    }
  }, []);

  const triggerVoiceOnboarding = async () => {
    try {
      toast.info("Nivara is initializing warm voice greeting...", { duration: 3000 });
      setOrbState('thinking');
      const { data } = await api.get('/voice/onboarding');
      if (data.audio_b64) {
        const audioBytes = Uint8Array.from(atob(data.audio_b64), (c) => c.charCodeAt(0));
        const audioBlob = new Blob([audioBytes], { type: 'audio/mpeg' });
        audioRef.current.src = URL.createObjectURL(audioBlob);
        setOrbState('speaking');
        audioRef.current.onended = () => {
          setOrbState('idle');
          localStorage.setItem('nivara_voice_onboarding_played', 'true');
        };
        audioRef.current.play().catch(() => setOrbState('idle'));
      }
    } catch (e) {
      setOrbState('idle');
    }
  };

  useEffect(() => {
    const ws = connectWS((msg) => {
      if (msg.type === 'counsellor_assigned') {
        toast.success(`Counsellor ${msg.counsellor_name} joined your safety circle`);
        setCounsellorOnline(msg.counsellor_name);
      }
      if (msg.type === 'counsellor_message') {
        toast.info(`Message from Counselor ${msg.counsellor_name}`);
        setMessages((m) => [...m, {
          role: 'counsellor',
          content: msg.message,
          sender: msg.counsellor_name,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
      }
      if (msg.type === 'status_change') { toast.info(`Case status: ${msg.status}`); loadCases(); }
      if (msg.type === 'followup_scheduled') { toast.info('A follow-up has been scheduled'); loadFollowups(); }
      if (msg.type === 'case_update') { toast.info(`Officer action: ${msg.action}`); loadCases(); }
    });
    return () => ws && ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadCases(); }, []);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, thinking]);

  const loadCases = async () => {
    try {
      const { data } = await api.get('/cases/mine');
      setCases(data);
      const active = data.find((c) => c.status !== 'resolved');
      if (active) {
        setCaseId(active.id);
        if (active.counsellor_name) setCounsellorOnline(active.counsellor_name);
      }
      const activeEmerg = data.find((c) => c.priority === 'emergency' && c.status !== 'resolved');
      setActiveEmergencyCase(activeEmerg || null);
      const allFollowups = [];
      for (const c of data.slice(0, 5)) {
        try {
          const d = await api.get(`/cases/${c.id}`);
          d.data.followups.forEach((f) => allFollowups.push({ ...f, case_title: c.title }));
        } catch {}
      }
      setFollowups(allFollowups);
    } catch (e) { /* silent */ }
  };
  const loadFollowups = loadCases;

  // Silent Safe Word SOS Trigger
  const checkSafeWord = (text) => {
    const lower = text.toLowerCase();
    const found = SAFE_WORDS.find((word) => lower.includes(word));
    if (found) {
      toast.warning('Silent Security Alert Triggered');
      triggerSilentSOS();
    }
  };

  const handleShareLocationWithConsent = async () => {
    setSharingLocation(true);
    try {
      const loc = await getUserLocation();
      if (!loc.has_location) {
        toast.error(`Location unavailable: ${loc.error_message || 'Permission denied'}. Please check browser permissions.`);
        return;
      }

      const payload = {
        latitude: loc.latitude,
        longitude: loc.longitude,
        location_label: 'Victim Shared via Chat Consent',
        accuracy: loc.accuracy,
        source: 'gps'
      };

      const targetCaseId = caseId || (cases && cases[0]?.id);
      if (targetCaseId) {
        await api.post(`/cases/${targetCaseId}/location`, payload);
      }

      toast.success(`Verified location shared: ${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}. Case record updated.`);

      const locMsgObj = {
        role: 'user',
        content: `📍 Shared my verified GPS location: (${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)})`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((m) => [...m, locMsgObj]);
      setShowLocationConsentModal(false);
      loadCases();
    } catch (e) {
      toast.error('Could not share location. Please try again.');
    } finally {
      setSharingLocation(false);
    }
  };

  const triggerSilentSOS = async () => {
    try {
      const location = await getUserLocation();
      const payload = {
        case_id: caseId,
        location_label: location.has_location ? 'Silent Safe-Word Triggered' : 'Silent Safe-Word Triggered (Location unavailable)',
        message: 'AUTOMATIC SAFE WORD ALERT DETECTED IN CHAT',
      };
      if (location.has_location && location.latitude != null && location.longitude != null) {
        payload.latitude = location.latitude;
        payload.longitude = location.longitude;
        payload.accuracy = location.accuracy;
      }
      await api.post('/sos', payload);
      toast.info('Silent security alert recorded in Nivara and internal duty staff alerted.');
      loadCases();
    } catch (e) {
      console.warn('Silent SOS failed:', e);
    }
  };

  const sendText = async (textToSend = null) => {
    const msg = (textToSend || input).trim();
    if (!msg || thinking) return;

    checkSafeWord(msg);

    const userMsgObj = { role: 'user', content: msg, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    setMessages((m) => [...m, userMsgObj]);
    if (!textToSend) setInput('');

    setThinking(true);
    setOrbState('thinking');
    
    // Dynamic Thinking Hints
    const hints = [
      "Nivara is analyzing risk factors...",
      "Evaluating language tone...",
      "Synthesizing safe response...",
      "Scanning context indicators..."
    ];
    setThinkingHint(hints[Math.floor(Math.random() * hints.length)]);

    const COMPLAINT_INTENT_REGEX = /\b(file\s+(a\s+)?complaint|report\s+(an\s+)?incident|register\s+(a\s+)?complaint|police\s+complaint|lodge\s+(a\s+)?complaint|official\s+complaint|formal\s+complaint)\b/i;
    if (COMPLAINT_INTENT_REGEX.test(msg)) {
      setShowComplaintModal(true);
    }

    try {
      const { data } = await api.post('/chat', { case_id: caseId, message: msg });
      setCaseId(data.case_id);
      setSvi({ score: data.svi_score, level: data.risk_level });

      if (data.complaint_intent_detected) {
        setShowComplaintModal(true);
      }

      if (data.language && data.language !== detectedLang) {
        setDetectedLang(data.language);
        const langNames = { en: 'English', ta: 'Tamil (தமிழ்)', hi: 'Hindi (हिंदी)', tanglish: 'Tanglish', hinglish: 'Hinglish' };
        setLangBanner(`Nivara adaptively switched to ${langNames[data.language] || data.language}`);
        setTimeout(() => setLangBanner(null), 5000);
      }

      if (data.suggested_replies && data.suggested_replies.length > 0) {
        setSuggestedReplies(data.suggested_replies);
      }

      const botMsgObj = { 
        role: 'assistant', 
        content: data.reply, 
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        svi_score: data.svi_score,
        risk_level: data.risk_level,
        action_prompt: data.action_prompt,
        ai_provider: data.ai_provider,
        indicators: data.indicators,
        suggested_replies: data.suggested_replies
      };
      setMessages((m) => [...m, botMsgObj]);
      speak(data.reply);
    } catch (e) {
      toast.error('AI service temporarily unavailable');
      setOrbState('idle');
    } finally { 
      setThinking(false); 
    }
  };

  const stopSpeaking = useCallback(() => {
    currentSpeechSessionRef.current += 1;
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      } catch (e) {
        console.warn('Error pausing audio element:', e);
      }
    }
    stopAllBrowserSpeech();
    setOrbState('idle');
    toast.info('Speech playback stopped');
  }, []);

  // Cleanup speech synthesis on component unmount
  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, [stopSpeaking]);

  const speak = async (text, targetLang = lang) => {
    if (!text || !text.trim()) return;

    // Invalidate any ongoing or pending speech session
    const sessionId = ++currentSpeechSessionRef.current;

    // Prevent multiple speech requests from causing overlapping playback
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch (e) {}
    }
    stopAllBrowserSpeech();

    setOrbState('speaking');

    try {
      const r = await api.post('/tts', { text, language: targetLang }, { responseType: 'blob' });
      // Cancel playback if user stopped speech while waiting for TTS response
      if (sessionId !== currentSpeechSessionRef.current) {
        return;
      }
      if (r.data && r.data.size > 0) {
        const url = URL.createObjectURL(r.data);
        audioRef.current.src = url;
        audioRef.current.onended = () => {
          URL.revokeObjectURL(url);
          if (sessionId === currentSpeechSessionRef.current) {
            setOrbState('idle');
          }
        };
        audioRef.current.onerror = () => {
          URL.revokeObjectURL(url);
          if (sessionId !== currentSpeechSessionRef.current) return;
          // Fallback to browser-native TTS on audio decode/playback error
          playBrowserTTS(text, targetLang, {
            onEnd: () => {
              if (sessionId === currentSpeechSessionRef.current) setOrbState('idle');
            },
            onError: () => {
              if (sessionId === currentSpeechSessionRef.current) setOrbState('idle');
            },
          });
        };
        if (sessionId === currentSpeechSessionRef.current) {
          await audioRef.current.play();
        }
        return;
      }
    } catch (err) {
      console.warn('Backend TTS unavailable or failed, falling back to browser speech synthesis:', err);
    }

    if (sessionId !== currentSpeechSessionRef.current) {
      return;
    }

    // Graceful fallback to browser-native speech synthesis
    playBrowserTTS(text, targetLang, {
      onEnd: () => {
        if (sessionId === currentSpeechSessionRef.current) setOrbState('idle');
      },
      onError: () => {
        if (sessionId === currentSpeechSessionRef.current) setOrbState('idle');
      },
    });
  };


  const handleAllowVoiceConsent = async () => {
    try {
      await api.post('/consent', { kind: 'voice', granted: true });
      setVoiceConsentAnswered(true);
      setShowVoiceConsentModal(false);
      toast.success('Voice analysis consent saved');
      startRecordingCore();
    } catch {
      setShowVoiceConsentModal(false);
      startRecordingCore();
    }
  };

  const handleDenyVoiceConsent = async () => {
    try {
      await api.post('/consent', { kind: 'voice', granted: false });
      setVoiceConsentAnswered(true);
      setShowVoiceConsentModal(false);
      toast.info('Voice acoustic analysis disabled. Proceeding with text STT only.');
      startRecordingCore();
    } catch {
      setShowVoiceConsentModal(false);
      startRecordingCore();
    }
  };

  const startRecording = async () => {
    if (!voiceConsentAnswered) {
      setShowVoiceConsentModal(true);
      return;
    }
    startRecordingCore();
  };

  const getBestMimeType = () => {
    const candidateTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus'
    ];
    if (typeof window !== 'undefined' && window.MediaRecorder) {
      for (const type of candidateTypes) {
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
          return type;
        }
      }
    }
    return '';
  };

  const liveSpeechRef = useRef(null);
  const inlineSpeechRef = useRef(null);
  const liveTranscriptRef = useRef('');

  const startRecordingCore = async () => {
    liveTranscriptRef.current = '';
    // 1. Try Live Web Speech API first
    if (isWebSpeechSupported()) {
      try {
        if (liveSpeechRef.current) {
          try { liveSpeechRef.current.abort(); } catch (e) {}
        }

        const recognizer = createLiveRecognizer({
          lang: lang || 'en-IN',
          onStart: () => {
            setOrbState('listening');
            toast.info('Listening live... Speak now!');
            setThinkingHint('Listening to your voice...');
          },
          onInterim: (interim, final) => {
            const combined = (final + ' ' + interim).trim();
            if (/^(stop|quiet|silence|pause|shut\s*up)$/i.test(combined)) {
              stopSpeaking();
              liveTranscriptRef.current = '';
              return;
            }
            liveTranscriptRef.current = combined;
            if (combined) {
              setThinkingHint(`"${combined}"`);
            }
          },
          onFinal: (finalChunk) => {
            const trimmed = finalChunk.trim();
            if (/^(stop|quiet|silence|pause|shut\s*up)$/i.test(trimmed)) {
              stopSpeaking();
              liveTranscriptRef.current = '';
              return;
            }
            liveTranscriptRef.current = (liveTranscriptRef.current + ' ' + finalChunk).trim();
          },
          onError: (event) => {
            console.warn('Live speech recognition notice:', event?.error);
            if (event?.error === 'not-allowed') {
              toast.error('Microphone permission denied. Please allow mic in your browser.');
              setOrbState('idle');
            } else if (event?.error === 'no-speech') {
              setThinkingHint('Speak into your microphone...');
            } else {
              // Fallback to media recorder if web speech has network/engine issue
              startMediaRecorderFallback();
            }
          },
          onEnd: () => {
            // Keep active if still listening
          }
        });

        if (recognizer) {
          liveSpeechRef.current = recognizer;
          recognizer.start();
          return;
        }
      } catch (err) {
        console.warn('Speech recognizer init error, falling back:', err);
      }
    }

    // 2. Fallback to MediaRecorder audio upload
    await startMediaRecorderFallback();
  };

  const startMediaRecorderFallback = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000
        }
      });
      const mimeType = getBestMimeType();
      const options = mimeType ? { mimeType } : {};
      const rec = new MediaRecorder(stream, options);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const finalBlobType = mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: finalBlobType });
        if (!blob || blob.size < 100) {
          toast.warning('No audio recorded. Please speak clearly into the microphone.');
          setOrbState('idle');
          return;
        }
        setOrbState('thinking'); setThinking(true);
        const fd = new FormData();
        const ext = finalBlobType.includes('mp4') ? 'mp4' : finalBlobType.includes('ogg') ? 'ogg' : 'webm';
        fd.append('audio', blob, `voice.${ext}`);
        if (caseId) fd.append('case_id', caseId);
        if (lang) fd.append('language', lang);
        try {
          const { data } = await api.post('/voice', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
          setCaseId(data.case_id);
          setSvi({ score: data.svi_score, level: data.risk_level });

          if (data.is_recognized === false) {
            toast.warning('Could not detect clear speech. Please speak closer to your microphone or type in the chat.');
            setOrbState('idle');
            setThinking(false);
            return;
          }

          if (data.transcript) {
            setRecognizedVoiceText(data.transcript);
            toast.success(`Heard: "${data.transcript}"`);
          }

          if (data.complaint_intent_detected) {
            setShowComplaintModal(true);
          }

          setMessages((m) => [
            ...m, 
            { role: 'user', content: data.transcript, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, 
            { 
              role: 'assistant', 
              content: data.reply, 
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              svi_score: data.svi_score,
              risk_level: data.risk_level,
              action_prompt: data.action_prompt,
              ai_provider: data.ai_provider,
              indicators: data.indicators,
              suggested_replies: data.suggested_replies
            }
          ]);
          if (data.audio_b64) {
            const sessionId = ++currentSpeechSessionRef.current;
            // Stop any playing audio to avoid overlapping speech
            if (audioRef.current) {
              try {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
              } catch (e) {}
            }
            stopAllBrowserSpeech();

            const audioBytes = Uint8Array.from(atob(data.audio_b64), (c) => c.charCodeAt(0));
            const isWav = audioBytes.length >= 4 && audioBytes[0] === 0x52 && audioBytes[1] === 0x49 && audioBytes[2] === 0x46 && audioBytes[3] === 0x46;
            const audioBlob = new Blob([audioBytes], { type: isWav ? 'audio/wav' : 'audio/mpeg' });
            const audioUrl = URL.createObjectURL(audioBlob);
            audioRef.current.src = audioUrl;
            setOrbState('speaking');
            audioRef.current.onended = () => {
              URL.revokeObjectURL(audioUrl);
              if (sessionId === currentSpeechSessionRef.current) {
                setOrbState('idle');
              }
            };
            audioRef.current.onerror = () => {
              URL.revokeObjectURL(audioUrl);
              if (sessionId !== currentSpeechSessionRef.current) return;
              playBrowserTTS(data.reply, lang, {
                onEnd: () => { if (sessionId === currentSpeechSessionRef.current) setOrbState('idle'); },
                onError: () => { if (sessionId === currentSpeechSessionRef.current) setOrbState('idle'); },
              });
            };
            if (sessionId === currentSpeechSessionRef.current) {
              audioRef.current.play().catch(() => {
                if (sessionId !== currentSpeechSessionRef.current) return;
                playBrowserTTS(data.reply, lang, {
                  onEnd: () => { if (sessionId === currentSpeechSessionRef.current) setOrbState('idle'); },
                  onError: () => { if (sessionId === currentSpeechSessionRef.current) setOrbState('idle'); },
                });
              });
            }
          } else {
            const sessionId = ++currentSpeechSessionRef.current;
            playBrowserTTS(data.reply, lang, {
              onStart: () => { if (sessionId === currentSpeechSessionRef.current) setOrbState('speaking'); },
              onEnd: () => { if (sessionId === currentSpeechSessionRef.current) setOrbState('idle'); },
              onError: () => { if (sessionId === currentSpeechSessionRef.current) setOrbState('idle'); },
            });
          }

        } catch (e) {
          toast.error(e?.response?.data?.detail || 'Voice processing failed'); setOrbState('idle');
        } finally { setThinking(false); }
      };
      mediaRef.current = rec;
      rec.start(200); setOrbState('listening');
      toast.info('Recording voice... Click orb again when finished.');
    } catch (e) {
      toast.error('Microphone access denied or unavailable');
      setOrbState('idle');
    }
  };

  const stopRecording = () => {
    // 1. Stop Live Speech Recognizer if active
    if (liveSpeechRef.current) {
      try {
        liveSpeechRef.current.stop();
      } catch (e) {}
      liveSpeechRef.current = null;

      const capturedText = liveTranscriptRef.current.trim();
      if (capturedText) {
        if (/^(stop|quiet|silence|pause|shut\s*up)$/i.test(capturedText)) {
          stopSpeaking();
          liveTranscriptRef.current = '';
          setOrbState('idle');
          return;
        }
        setRecognizedVoiceText(capturedText);
        toast.success(`Heard: "${capturedText}"`);
        setOrbState('thinking');
        sendText(capturedText);
        return;
      }
    }

    // 2. Stop MediaRecorder if active
    if (mediaRef.current) {
      if (typeof mediaRef.current.stop === 'function' && mediaRef.current.state !== 'inactive') {
        try { mediaRef.current.stop(); } catch (e) { console.error(e); }
      } else if (typeof mediaRef.current.abort === 'function') {
        try { mediaRef.current.abort(); } catch (e) { console.error(e); }
      }
    } else {
      setOrbState('idle');
    }
  };

  // Inline Voice-to-Text in Chat Input Bar
  const startInlineRecording = async () => {
    // 1. Try Live Web Speech Recognition first
    if (isWebSpeechSupported()) {
      try {
        if (inlineSpeechRef.current) {
          try { inlineSpeechRef.current.abort(); } catch (e) {}
        }

        const recognizer = createLiveRecognizer({
          lang: lang || 'en-IN',
          onStart: () => {
            setRecordingInline(true);
            toast.info('Listening to your voice... Speak now!');
          },
          onInterim: (interim, final) => {
            const full = (final + ' ' + interim).trim();
            if (full) setInput(full);
          },
          onFinal: (finalText) => {
            setInput((prev) => (prev ? `${prev.trim()} ${finalText}` : finalText));
          },
          onError: (ev) => {
            console.warn('Inline speech error:', ev?.error);
            if (ev?.error === 'not-allowed') {
              toast.error('Microphone access denied');
              setRecordingInline(false);
            } else if (ev?.error !== 'no-speech') {
              startInlineMediaRecorderFallback();
            }
          },
          onEnd: () => {
            setRecordingInline(false);
          }
        });

        if (recognizer) {
          inlineSpeechRef.current = recognizer;
          recognizer.start();
          return;
        }
      } catch (err) {
        console.warn('Inline recognizer error:', err);
      }
    }

    // 2. Fallback to MediaRecorder upload
    await startInlineMediaRecorderFallback();
  };

  const startInlineMediaRecorderFallback = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000
        }
      });
      const mimeType = getBestMimeType();
      const options = mimeType ? { mimeType } : {};
      const rec = new MediaRecorder(stream, options);
      inlineChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) inlineChunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const finalBlobType = mimeType || 'audio/webm';
        const blob = new Blob(inlineChunksRef.current, { type: finalBlobType });
        setRecordingInline(false);
        if (!blob || blob.size < 100) {
          toast.warning('No audio captured. Please try again.');
          return;
        }
        const fd = new FormData();
        const ext = finalBlobType.includes('mp4') ? 'mp4' : finalBlobType.includes('ogg') ? 'ogg' : 'webm';
        fd.append('audio', blob, `voice.${ext}`);
        if (caseId) fd.append('case_id', caseId);
        if (lang) fd.append('language', lang);
        try {
          toast.info('Transcribing voice...');
          const { data } = await api.post('/stt', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
          if (data.transcript && !data.transcript.includes('[Voice recorded')) {
            setInput(data.transcript);
            toast.success(`Transcribed: "${data.transcript}"`);
          } else {
            toast.warning('Speech could not be recognized clearly. Please try speaking again.');
          }
        } catch (e) {
          toast.error(e?.response?.data?.detail || 'Failed to transcribe voice');
        }

      };
      inlineMediaRef.current = rec;
      rec.start(200);
      setRecordingInline(true);
      toast.info('Listening... Click mic again to stop and transcribe.');
    } catch (e) {
      toast.error('Microphone access denied or unavailable');
      setRecordingInline(false);
    }
  };

  const stopInlineRecording = () => {
    if (inlineSpeechRef.current) {
      try {
        inlineSpeechRef.current.stop();
      } catch (e) {}
      inlineSpeechRef.current = null;
    }

    if (inlineMediaRef.current) {
      if (typeof inlineMediaRef.current.stop === 'function' && inlineMediaRef.current.state !== 'inactive') {
        try { inlineMediaRef.current.stop(); } catch (e) { console.error(e); }
      } else if (typeof inlineMediaRef.current.abort === 'function') {
        try { inlineMediaRef.current.abort(); } catch (e) { console.error(e); }
      }
    }
    setRecordingInline(false);
  };

  const triggerSOS = () => setShowSOS(true);
  const confirmSOS = async () => {
    try {
      toast.info('Checking your location...');
      const location = await getUserLocation();
      const payload = {
        case_id: caseId,
        message: sosMsg.trim() || undefined,
      };
      if (location && location.has_location && location.latitude != null && location.longitude != null) {
        payload.latitude = location.latitude;
        payload.longitude = location.longitude;
        payload.location_label = location.location_label;
        payload.accuracy = location.accuracy;
      } else {
        payload.location_label = 'Location unavailable / denied by user';
      }

      const { data } = await api.post('/sos', payload);

      if (data.assigned_officer && data.assigned_officer.name) {
        const distText = data.assigned_officer.distance_km != null
          ? ` (${data.assigned_officer.distance_km} km away, ${data.assigned_officer.duty_area})`
          : ` (${data.assigned_officer.duty_area || 'Duty Desk'})`;
        toast.info(
          `⚠️ SOS recorded in Nivara. Assigned duty officer: ${data.assigned_officer.name}${distText}. NOTE: External emergency services are NOT automatically dispatched — call 112 directly if in immediate danger.`,
          { duration: 9000 }
        );
      } else {
        toast.info(
          '⚠️ SOS recorded in Nivara and internal duty staff alerted. Call 112 directly for emergency police/ambulance services.',
          { duration: 9000 }
        );
      }
      setShowSOS(false);
      setSosMsg('');
      loadCases();
    } catch (err) {
      toast.error('Could not record SOS emergency alert: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Export Evidence Report
  const handleExportEvidence = () => {
    const textContent = `NIVARA CASE EVIDENCE REPORT\n` +
      `Date Generated: ${new Date().toLocaleString()}\n` +
      `Case ID: ${caseId || 'N/A'}\n` +
      `Victim Name: ${user?.name || 'Anonymous'}\n` +
      `Current Safety Vulnerability Index (SVI): ${svi.score} (${svi.level})\n\n` +
      `=== TRANSCRIPT TIMELINE ===\n\n` +
      messages.map((m, i) => `[${m.timestamp || 'N/A'}] ${m.role === 'user' ? 'VICTIM' : m.role === 'counsellor' ? `COUNSELLOR (${m.sender})` : 'NIVARA AI'}:\n${m.content}\n`).join('\n-------------------------\n');

    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Nivara_Evidence_Report_${caseId || 'case'}.txt`;
    link.click();
    toast.success('Evidence timeline exported successfully');
  };

  // Disguise View
  if (isDisguised) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-6 flex flex-col items-center justify-center relative">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
          <div className="flex justify-between items-center border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2 font-bold text-slate-300 text-sm">
              <FileText className="w-4 h-4 text-emerald-400" /> Daily Notes & Math Helper
            </div>
            <button 
              onClick={() => setIsDisguised(false)} 
              className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-full flex items-center gap-1.5 text-slate-400 hover:text-white transition"
              title="Unlock Safety App"
            >
              <Lock className="w-3 h-3 text-emerald-400" /> Restore Mode
            </button>
          </div>
          
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Quick Calculation & Shopping List</h3>
            <div className="bg-slate-950 p-4 rounded-xl text-right font-mono text-2xl tracking-wider text-emerald-400 border border-slate-800">
              1,240.00
            </div>
            <div className="grid grid-cols-4 gap-2 text-center font-bold text-slate-300">
              {['7','8','9','/','4','5','6','*','1','2','3','-','0','.','=','+'].map((btn, i) => (
                <div key={i} className="p-3 bg-slate-800/60 rounded-lg hover:bg-slate-800 cursor-pointer">{btn}</div>
              ))}
            </div>
          </div>

          <div className="pt-2 text-xs text-slate-500 text-center">
            Press "Restore Mode" to return to active view.
          </div>
        </div>
      </div>
    );
  }

  // Calculate SVI Color Gradient for Live Pulse Bar
  const getSviGradient = (score) => {
    if (score >= 75) return 'from-red-600 via-rose-500 to-red-600';
    if (score >= 50) return 'from-orange-500 via-amber-500 to-red-500';
    if (score >= 25) return 'from-yellow-500 via-emerald-400 to-amber-500';
    return 'from-emerald-500 via-teal-400 to-cyan-500';
  };

  return (
    <div className="min-h-screen font-victim text-slate-100 relative overflow-hidden"
         style={{ background: 'linear-gradient(160deg, #0F172A 0%, #1E293B 60%, #1a1032 100%)' }}>
      <div className="absolute inset-0 pointer-events-none opacity-40"
           style={{ background: 'radial-gradient(circle at 20% 30%, rgba(196,181,253,0.35), transparent 45%), radial-gradient(circle at 80% 70%, rgba(138,154,91,0.3), transparent 45%)' }} />

      {/* Feature 1: Live SVI Pulse Meter Bar (Top) */}
      <div className="relative z-20 bg-slate-950/85 backdrop-blur border-b border-slate-800/80 px-4 sm:px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Activity className={`w-4 h-4 ${svi.score >= 50 ? 'text-red-400 animate-pulse' : 'text-emerald-400'}`} />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 hidden sm:inline">Live SVI Pulse</span>
          </div>
          
          <div className="w-28 sm:w-44 bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-800 relative">
            <div 
              className={`h-full rounded-full bg-gradient-to-r ${getSviGradient(svi.score)} transition-all duration-500`} 
              style={{ width: `${Math.max(8, svi.score)}%` }}
            />
            {svi.score >= 50 && (
              <div className="absolute inset-0 bg-red-500/20 animate-ping rounded-full" />
            )}
          </div>
          <span className="text-xs font-extrabold text-slate-200">{svi.score}/100</span>
        </div>

        {/* Action Toolbox: Radar, Safety Plan, Evidence Vault, Disguise, Voice Assistant */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Voice to Text Assistant */}
          <button 
            onClick={() => setShowVoiceAssistantModal(true)}
            className="px-2.5 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-1 transition"
            title="Voice to Text Assistant"
          >
            <Mic className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Voice Assistant</span>
          </button>

          {/* Safe Haven Radar */}
          <button 
            onClick={() => setShowRadarModal(true)}
            className="px-2.5 py-1 rounded-lg bg-teal-950/80 hover:bg-teal-900 border border-teal-500/40 text-teal-300 text-xs font-semibold flex items-center gap-1 transition"
            title="Safe Haven Radar Map"
          >
            <Radio className="w-3.5 h-3.5 text-teal-400 animate-pulse" />
            <span className="hidden md:inline">Safe Havens</span>
          </button>

          {/* AI Safety Action Plan */}
          <button 
            onClick={() => setShowSafetyPlanModal(true)}
            className="px-2.5 py-1 rounded-lg bg-violet-950/80 hover:bg-violet-900 border border-violet-500/40 text-violet-300 text-xs font-semibold flex items-center gap-1 transition"
            title="AI Safety Action Strategy"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-violet-400" />
            <span className="hidden md:inline">Safety Plan</span>
          </button>

          {/* Stealth Evidence Vault */}
          <button 
            onClick={() => setShowEvidenceModal(true)}
            className="px-2.5 py-1 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 text-xs font-semibold flex items-center gap-1 transition"
            title="Evidence Vault"
          >
            <Camera className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden md:inline">Vault</span>
          </button>

          {/* File Complaint Wizard */}
          <button 
            onClick={() => setShowComplaintModal(true)}
            className="px-2.5 py-1 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-500/40 text-indigo-300 text-xs font-semibold flex items-center gap-1 transition"
            title="File an Official Incident Complaint"
            data-testid="victim-file-complaint-btn"
          >
            <FileText className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden md:inline">File Complaint</span>
          </button>

          {/* Disguise Screen */}
          <button 
            onClick={() => setIsDisguised(true)}
            className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1 border border-slate-700 transition"
            title="Disguise Screen Privacy"
          >
            <EyeOff className="w-3.5 h-3.5 text-violet-400" />
            <span className="hidden lg:inline">Disguise</span>
          </button>
        </div>
      </div>

      {/* Top bar */}
      <div className="relative z-10 flex justify-between items-center px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Hi, <span className="text-white font-semibold">{user?.name}</span></span>
          {counsellorOnline && (
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
              <UserCheck className="w-3 h-3" /> Counselor Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <SVIBadge score={svi.score} level={svi.level} />
          <NotificationCenter />
          <select value={lang} onChange={(e) => setLang(e.target.value)} data-testid="victim-lang"
                  className="bg-slate-900/60 border border-slate-700 rounded-lg px-2 py-1 text-xs">
            <option value="en">EN</option><option value="ta">TA</option><option value="hi">HI</option>
          </select>
          <button onClick={logout} data-testid="victim-logout" className="p-2 rounded-lg hover:bg-slate-800/60"><LogOut className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Language Switch Banner */}
      {langBanner && (
        <div className="relative z-20 max-w-xl mx-auto mb-2 px-4">
          <div className="bg-violet-600/90 text-white text-xs font-semibold px-4 py-2 rounded-xl backdrop-blur border border-violet-400/40 shadow-xl flex items-center justify-between animate-bounce">
            <span className="flex items-center gap-2"><Globe className="w-4 h-4" /> {langBanner}</span>
            <button onClick={() => setLangBanner(null)}><X className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      )}

      {/* Emergency Response Workflow Tracker */}
      {activeEmergencyCase && (
        <div className="relative z-20 max-w-4xl mx-auto mb-3 px-6" data-testid="emergency-workflow-tracker">
          <div className="p-3.5 rounded-2xl bg-red-950/70 border border-red-500/40 backdrop-blur shadow-2xl">
            <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-red-500/20">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                <span className="text-xs font-black uppercase tracking-wider text-red-300">Active Emergency SOS Case</span>
              </div>
              <span className="text-[11px] text-red-300/80 font-mono">Case #{activeEmergencyCase.id.slice(-6)}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {/* Step 1: Alert Recorded */}
              <div className="p-2 rounded-xl bg-slate-900/80 border border-emerald-500/40 flex items-center gap-2" data-testid="tracker-step-recorded">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold">✓</div>
                <div>
                  <div className="text-xs font-bold text-white">1. Alert Recorded</div>
                  <div className="text-[10px] text-emerald-400">Stored in NIVARA</div>
                </div>
              </div>

              {/* Step 2: Officer Assigned */}
              <div className={`p-2 rounded-xl border flex items-center gap-2 ${
                activeEmergencyCase.officer_id
                  ? 'bg-slate-900/80 border-emerald-500/40'
                  : 'bg-slate-900/50 border-amber-500/40 animate-pulse'
              }`} data-testid="tracker-step-assigned">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                  activeEmergencyCase.officer_id ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                }`}>
                  {activeEmergencyCase.officer_id ? '✓' : '2'}
                </div>
                <div>
                  <div className="text-xs font-bold text-white">2. Officer Assigned</div>
                  <div className={`text-[10px] truncate max-w-[140px] ${activeEmergencyCase.officer_id ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {activeEmergencyCase.officer_id ? 'Duty Staff Assigned' : 'Finding Officer...'}
                  </div>
                </div>
              </div>

              {/* Step 3: Officer Acknowledged */}
              <div className={`p-2 rounded-xl border flex items-center gap-2 ${
                activeEmergencyCase.acknowledgment_status === 'acknowledged'
                  ? 'bg-slate-900/80 border-emerald-500/40'
                  : 'bg-slate-900/50 border-neutral-700'
              }`} data-testid="tracker-step-acknowledged">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                  activeEmergencyCase.acknowledgment_status === 'acknowledged' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-neutral-800 text-neutral-400'
                }`}>
                  {activeEmergencyCase.acknowledgment_status === 'acknowledged' ? '✓' : '3'}
                </div>
                <div>
                  <div className="text-xs font-bold text-white">3. Acknowledged</div>
                  <div className={`text-[10px] ${activeEmergencyCase.acknowledgment_status === 'acknowledged' ? 'text-emerald-400 font-semibold' : 'text-neutral-400'}`}>
                    {activeEmergencyCase.acknowledgment_status === 'acknowledged' ? 'Officer Responding' : 'Pending Review'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content by tab */}
      <div className="relative z-10 max-w-4xl mx-auto px-6 pb-32">
        {tab === 'voice' && (
          <div className="flex flex-col items-center justify-center pt-4 space-y-6">
            <div className={`victim-orb ${orbState !== 'idle' ? orbState : ''} w-52 h-52 rounded-full`} data-testid="victim-orb" />
            
            <div className="text-center">
              <div className="text-xs uppercase tracking-widest text-violet-300 mb-1">
                {orbState === 'listening' ? t(lang, 'listening')
                  : orbState === 'thinking' ? t(lang, 'thinking')
                  : orbState === 'speaking' ? t(lang, 'speaking')
                  : t(lang, 'tapToSpeak')}
              </div>
            </div>

            {/* Dedicated Visible Stop Speaking Control */}
            {orbState === 'speaking' && (
              <button
                onClick={stopSpeaking}
                data-testid="stop-speaking-voice-btn"
                className="px-6 py-2.5 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-2 shadow-xl animate-pulse transition hover:scale-105 cursor-pointer"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>Stop Speaking</span>
              </button>
            )}

            <button
              onClick={() => {
                if (orbState === 'speaking') {
                  stopSpeaking();
                } else if (orbState === 'listening') {
                  stopRecording();
                } else if (orbState === 'idle') {
                  startRecording();
                }
              }}
              data-testid="voice-record-btn"
              className={`w-16 h-16 rounded-full flex items-center justify-center ${
                orbState === 'speaking'
                  ? 'bg-amber-500 text-slate-900 animate-pulse'
                  : orbState === 'listening'
                  ? 'bg-red-500 animate-pulse text-white'
                  : 'bg-violet-400 text-slate-900'
              } shadow-2xl hover:scale-105 transition cursor-pointer`}
              title={
                orbState === 'speaking'
                  ? 'Click to Stop Speaking'
                  : orbState === 'listening'
                  ? 'Click to Stop & Send'
                  : 'Click to Start Speaking'
              }
            >
              {orbState === 'speaking' ? (
                <Square className="w-6 h-6 fill-current text-slate-900" />
              ) : orbState === 'listening' ? (
                <MicOff className="w-7 h-7 text-white" />
              ) : (
                <Mic className="w-7 h-7" />
              )}
            </button>
            <p className="text-xs text-slate-400 font-medium">
              {orbState === 'speaking'
                ? '🔊 Nivara is speaking... Say "Stop" or click button to interrupt'
                : orbState === 'listening'
                ? '🔴 Recording... Click red button when finished speaking'
                : 'Click microphone button once to talk'}
            </p>

            {recognizedVoiceText && (
              <div className="max-w-md w-full p-3 rounded-2xl bg-slate-900/90 border border-violet-500/40 text-center space-y-1">
                <span className="text-[10px] uppercase font-bold text-violet-400 tracking-wider">Recognized Speech Input</span>
                <p className="text-xs text-white italic">&quot;{recognizedVoiceText}&quot;</p>
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap justify-center">
              <button
                onClick={() => setShowVoiceAssistantModal(true)}
                className="px-4 py-2 rounded-xl bg-slate-900/90 border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-2 shadow transition"
              >
                🎙️ Open Voice to Text Assistant App
              </button>

              <button
                onClick={() => setShowComplaintModal(true)}
                className="px-4 py-2 rounded-xl bg-indigo-950/90 border border-indigo-700/60 hover:bg-indigo-900 text-indigo-300 text-xs font-semibold flex items-center gap-1.5 shadow transition"
              >
                <FileText className="w-4 h-4 text-indigo-400" />
                <span>File Incident Complaint</span>
              </button>
            </div>

            {/* Biometric Voice Stress Spectrum Visualizer */}
            <div className="w-full max-w-lg">
              <BiometricVoiceVisualizer
                isRecording={orbState === 'listening'}
                isPlaying={orbState === 'speaking'}
                stressScore={svi.score}
              />
            </div>

            {messages.length > 0 && (
              <div className="w-full max-h-56 overflow-y-auto space-y-2" data-testid="voice-transcript">
                {messages.slice(-4).map((m, i) => (
                  <div key={i} className={`p-3 rounded-2xl ${m.role === 'user' ? 'bg-violet-500/20 ml-12' : 'bg-slate-800/60 mr-12'}`}>
                    <div className="text-xs text-slate-400 mb-1">{m.role === 'user' ? 'You' : m.role === 'counsellor' ? `Counselor ${m.sender}` : 'Nivara'}</div>
                    <div className="text-sm">{m.content}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'chat' && (
          <div className="pt-2 flex flex-col h-[calc(100vh-250px)] relative" data-testid="victim-chat">
            
            {/* Panic Shortcut inside Chat */}
            {svi.score >= 40 && (
              <div className="mb-3 p-3 bg-red-950/80 border border-red-500/40 rounded-2xl flex items-center justify-between text-red-200 text-xs backdrop-blur shadow-lg animate-pulse">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-red-400" />
                  <span>Risk detected (SVI: {svi.score}). Emergency support available instantly.</span>
                </div>
                <button 
                  onClick={triggerSOS}
                  className="px-3 py-1.5 bg-red-500 hover:bg-red-400 text-white font-bold rounded-xl text-xs flex items-center gap-1 shadow"
                >
                  🚨 Trigger SOS Now
                </button>
              </div>
            )}

            <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pb-4 pr-1">
              {messages.length === 0 && (
                <div className="text-center text-slate-400 py-12">
                  <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-40 text-violet-400" />
                  <p className="text-slate-300 font-medium">Whatever you're carrying, share it here. I'm listening with care.</p>
                  <p className="text-xs text-slate-500 mt-2">💡 Tip: Type safe-word <span className="text-violet-300 font-mono">"pineapple"</span> or <span className="text-violet-300 font-mono">"red"</span> for silent SOS dispatch.</p>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={`p-4 rounded-2xl max-w-[85%] ${
                  m.role === 'user' 
                    ? 'bg-violet-600/30 border border-violet-500/30 ml-auto' 
                    : m.role === 'counsellor'
                    ? 'bg-emerald-950/80 border border-emerald-500/50 backdrop-blur'
                    : 'bg-slate-900/80 border border-slate-800 backdrop-blur'
                }`}>
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span className={`font-semibold ${m.role === 'counsellor' ? 'text-emerald-300 flex items-center gap-1' : ''}`}>
                      {m.role === 'user' ? 'You' : m.role === 'counsellor' ? `🛡️ Counselor ${m.sender}` : 'Nivara AI'}
                    </span>
                    {m.timestamp && <span className="text-[10px] text-slate-500">{m.timestamp}</span>}
                  </div>
                  <div className="text-sm leading-relaxed text-slate-100">{m.content}</div>
                  
                  {m.role === 'assistant' && (
                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <button onClick={() => speak(m.content, lang)} className="text-xs text-violet-300 hover:text-violet-200 flex items-center gap-1">
                          <Volume2 className="w-3.5 h-3.5" /> Voice Reply
                        </button>
                        <div className="flex items-center gap-2">
                          {m.risk_level && (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                              m.risk_level === 'Critical' ? 'bg-red-950/80 text-red-300 border-red-500/50' :
                              m.risk_level === 'High' ? 'bg-orange-950/80 text-orange-300 border-orange-500/50' :
                              m.risk_level === 'Moderate' ? 'bg-amber-950/80 text-amber-300 border-amber-500/50' :
                              'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
                            }`}>
                              {m.risk_level} Risk {m.svi_score !== undefined ? `(${m.svi_score})` : ''}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Contextual Action Buttons */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {(m.action_prompt === 'file_complaint' || m.risk_level === 'Moderate' || m.risk_level === 'High') && (
                          <button
                            onClick={() => setShowComplaintModal(true)}
                            className="text-xs bg-violet-950/80 hover:bg-violet-900 text-violet-200 border border-violet-500/50 px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition"
                          >
                            <FileText className="w-3.5 h-3.5 text-violet-400" /> File Complaint
                          </button>
                        )}
                        {(m.action_prompt === 'share_location' || m.risk_level === 'Moderate' || m.risk_level === 'High' || m.risk_level === 'Critical') && (
                          <button
                            onClick={() => setShowLocationConsentModal(true)}
                            className="text-xs bg-sky-950/80 hover:bg-sky-900 text-sky-200 border border-sky-500/50 px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition"
                          >
                            <MapPin className="w-3.5 h-3.5 text-sky-400" /> Share My Location
                          </button>
                        )}
                        {(m.action_prompt === 'call_112' || m.risk_level === 'High' || m.risk_level === 'Critical') && (
                          <a
                            href="tel:112"
                            className="text-xs bg-red-950/90 hover:bg-red-900 text-red-200 border border-red-500/60 px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition font-semibold"
                          >
                            <PhoneCall className="w-3.5 h-3.5 text-red-400 animate-pulse" /> Call 112 (Emergency)
                          </a>
                        )}
                        {m.action_prompt === 'vault_upload' && (
                          <button
                            onClick={() => setShowEvidenceModal(true)}
                            className="text-xs bg-amber-950/80 hover:bg-amber-900 text-amber-200 border border-amber-500/50 px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition"
                          >
                            <Lock className="w-3.5 h-3.5 text-amber-400" /> Open Evidence Vault
                          </button>
                        )}
                        {m.action_prompt === 'open_safe_haven' && (
                          <button
                            onClick={() => setShowRadarModal(true)}
                            className="text-xs bg-teal-950/80 hover:bg-teal-900 text-teal-200 border border-teal-500/50 px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition"
                          >
                            <Shield className="w-3.5 h-3.5 text-teal-400" /> Safe Haven Radar
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* AI Thinking Animation with Emotion Hint */}
              {thinking && (
                <div className="p-4 rounded-2xl max-w-[75%] bg-slate-900/90 border border-violet-500/30 flex items-center gap-3 shadow-xl">
                  <Sparkles className="w-4 h-4 text-violet-400 animate-spin" />
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-violet-300">{thinkingHint}</div>
                    <div className="flex gap-1.5 items-center">
                      <span className="w-2 h-2 bg-violet-400 rounded-full animate-ping" />
                      <span className="w-2 h-2 bg-violet-400 rounded-full animate-ping delay-150" />
                      <span className="w-2 h-2 bg-violet-400 rounded-full animate-ping delay-300" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Suggested Quick Reply Chips */}
            {suggestedReplies.length > 0 && !thinking && (
              <div className="mb-2 flex flex-wrap gap-2">
                {suggestedReplies.map((replyText, idx) => (
                  <button
                    key={idx}
                    onClick={() => sendText(replyText)}
                    className="text-xs bg-slate-900/90 hover:bg-violet-950 text-slate-300 hover:text-violet-200 border border-slate-700/80 hover:border-violet-500/60 px-3 py-1.5 rounded-full transition shadow-sm"
                  >
                    ✨ {replyText}
                  </button>
                ))}
              </div>
            )}

            {/* If bot is speaking, show visible Stop Speaking control */}
            {orbState === 'speaking' && (
              <div className="flex items-center justify-between bg-violet-950/90 border border-violet-500/50 rounded-xl px-3 py-1.5 mb-2 shadow-lg animate-pulse" data-testid="chat-speaking-banner">
                <span className="text-xs text-violet-200 flex items-center gap-1.5 font-medium">
                  <Volume2 className="w-3.5 h-3.5 text-violet-400" />
                  <span>Nivara is speaking...</span>
                </span>
                <button
                  onClick={stopSpeaking}
                  data-testid="stop-speaking-chat-btn"
                  className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold rounded-lg flex items-center gap-1 shadow transition cursor-pointer"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>Stop Speaking</span>
                </button>
              </div>
            )}

            {/* Chat Input Bar with Inline Voice Mic */}
            <div className="flex gap-2 items-center bg-slate-900/80 backdrop-blur border border-slate-800 rounded-2xl p-2 shadow-2xl">
              <button
                onClick={() => {
                  if (recordingInline) {
                    stopInlineRecording();
                  } else {
                    startInlineRecording();
                  }
                }}
                className={`p-2.5 rounded-xl text-slate-300 hover:bg-slate-800 transition ${recordingInline ? 'bg-red-500 text-white animate-pulse' : 'hover:text-violet-300'}`}
                title={recordingInline ? "Click to Stop & Transcribe" : "Click to Speak"}
              >
                {recordingInline ? <MicOff className="w-4 h-4 text-white" /> : <Mic className="w-4 h-4" />}
              </button>

              <input value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendText()} data-testid="chat-input"
                placeholder={recordingInline ? "Listening to your voice..." : t(lang, 'typeMessage')}
                className="flex-1 bg-transparent px-3 py-2 outline-none text-sm text-slate-100 placeholder-slate-500" />
              
              <button onClick={() => sendText()} disabled={thinking || !input.trim()} data-testid="chat-send"
                className="p-2.5 rounded-xl bg-violet-400 text-slate-900 hover:bg-violet-300 disabled:opacity-30 transition">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {tab === 'help' && (
          <div className="flex flex-col items-center pt-8">
            <div className="max-w-md text-center mb-8">
              <AlertTriangle className="w-14 h-14 mx-auto text-red-400 mb-4 animate-bounce" />
              <p className="text-slate-300 leading-relaxed">
                Pressing the button below will send your <b>live location</b>, case history, and current risk
                assessment to the nearest officer on duty. You are safe. Help is close.
              </p>
            </div>
            <button onClick={triggerSOS} data-testid="sos-btn"
              className="px-10 py-6 rounded-full text-lg font-black tracking-wide bg-red-500 hover:bg-red-400 text-white shadow-2xl shadow-red-500/40 animate-pulse">
              🚨 {t(lang, 'needHelpNow')}
            </button>
          </div>
        )}

        {tab === 'cases' && (
          <div className="pt-4 space-y-3" data-testid="case-status-list">
            <h2 className="text-2xl font-extrabold mb-4">{t(lang, 'caseStatus')}</h2>
            {cases.length === 0 && <p className="text-slate-400">{t(lang, 'noCases')}</p>}
            {cases.map((c) => (
              <div key={c.id} className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold">{c.title}</div>
                    <div className="text-xs text-slate-400 mt-1">Status: <span className="text-violet-300">{c.status}</span> · Priority: {c.priority}</div>
                    {c.counsellor_name && <div className="text-xs text-emerald-300 mt-1">Counsellor: {c.counsellor_name}</div>}
                  </div>
                  <SVIBadge score={c.svi_score} level={c.risk_level} />
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'follow' && (
          <div className="pt-4 space-y-3" data-testid="followups-list">
            <h2 className="text-2xl font-extrabold mb-4">{t(lang, 'followups')}</h2>
            {followups.length === 0 && <p className="text-slate-400">No follow-ups scheduled yet.</p>}
            {followups.map((f) => (
              <div key={f.id} className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
                <div className="text-xs text-violet-300">{new Date(f.scheduled_at).toLocaleString()}</div>
                <div className="font-semibold mt-1">{f.case_title}</div>
                {f.notes && <div className="text-sm text-slate-400 mt-1">{f.notes}</div>}
              </div>
            ))}
          </div>
        )}

        {tab === 'settings' && (
          <div className="pt-4 max-w-2xl space-y-6 pb-24" data-testid="victim-settings">
            <h2 className="text-2xl font-extrabold flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-violet-400" /> Victim Profile & Safety Settings
            </h2>

            {/* Victim Profile Form */}
            <form onSubmit={handleSaveProfile} className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4" data-testid="victim-profile-section">
              <div className="border-b border-slate-800 pb-3">
                <div className="font-bold text-sm text-slate-200 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-400" /> Confidential Safety Profile
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Your profile details are stored securely. Phone number and emergency medical indicators (such as blood group) are accessible only to authorized duty officers responding to an active SOS alert.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Full Name</label>
                  <input
                    type="text"
                    required
                    data-testid="profile-name-input"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                    className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-sm focus:border-violet-400 outline-none"
                    placeholder="Your legal or preferred name"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Contact Phone Number</label>
                  <input
                    type="tel"
                    data-testid="profile-phone-input"
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                    className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-sm focus:border-violet-400 outline-none"
                    placeholder="+91 98765 43210"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Used by duty officers to call you during an emergency SOS.</span>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Gender</label>
                  <select
                    data-testid="profile-gender-select"
                    value={profileForm.gender}
                    onChange={(e) => setProfileForm({ ...profileForm, gender: e.target.value })}
                    className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-sm focus:border-violet-400 outline-none"
                  >
                    <option value="">Select gender…</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Non-Binary">Non-Binary</option>
                    <option value="Other">Other</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Blood Group (Medical Alert)</label>
                  <select
                    data-testid="profile-blood-group-select"
                    value={profileForm.blood_group}
                    onChange={(e) => setProfileForm({ ...profileForm, blood_group: e.target.value })}
                    className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-sm focus:border-violet-400 outline-none"
                  >
                    <option value="">Select blood group…</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                    <option value="Unknown">Unknown</option>
                  </select>
                  <span className="text-[10px] text-slate-400 mt-1 block">Preserved for emergency medical responders.</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Registered Home / Safe Residence Location</label>
                <input
                  type="text"
                  data-testid="profile-saved-location-input"
                  value={profileForm.saved_location}
                  onChange={(e) => setProfileForm({ ...profileForm, saved_location: e.target.value })}
                  className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-sm focus:border-violet-400 outline-none"
                  placeholder="e.g. 124 Green Garden Layout, Siruseri, Chennai"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Registered address. This is strictly kept separate from live emergency GPS coordinates.</span>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">{t(lang, 'language')}</label>
                <select
                  data-testid="profile-language-select"
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                  className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-sm focus:border-violet-400 outline-none"
                >
                  <option value="en">{t(lang, 'en')}</option>
                  <option value="ta">{t(lang, 'ta')}</option>
                  <option value="hi">{t(lang, 'hi')}</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  data-testid="save-profile-btn"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-400 to-emerald-500 text-slate-900 font-bold hover:shadow-lg hover:shadow-violet-500/20 disabled:opacity-60 transition text-sm flex items-center gap-2"
                >
                  {isSavingProfile ? 'Saving…' : 'Save Safety Profile'}
                </button>
              </div>
            </form>

            {/* Silent Safe Words Section */}
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Silent Safe Words</label>
              <p className="text-xs text-slate-400 leading-relaxed">
                Typing any of these words in chat triggers a silent high-priority security alert to duty officers without displaying an audible or visual alarm: <span className="font-mono text-violet-300 font-bold">pineapple, red, mayday</span>
              </p>
            </div>

            {/* My Safety & Incident History */}
            <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3" data-testid="victim-safety-history">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="font-bold text-sm text-slate-200 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-violet-400" /> My Safety & Incident History
                </div>
                <span className="text-xs text-slate-400 font-mono">{cases.length} Records</span>
              </div>

              {cases.length === 0 ? (
                <p className="text-xs text-slate-500 py-3 text-center">No previous emergency or complaint incidents recorded.</p>
              ) : (
                <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                  {cases.map((c) => (
                    <div key={c.id} className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl space-y-1.5 text-xs">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-semibold text-slate-100">{c.title}</div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(c.created_at).toLocaleString()} · ID: {c.id.slice(0, 8)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {c.priority === 'emergency' && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                              🚨 SOS
                            </span>
                          )}
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            c.status === 'resolved' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-blue-500/20 text-blue-300'
                          }`}>
                            {c.status.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-slate-300 border-t border-slate-700/40 pt-1.5">
                        <span>SVI Score: <strong className="text-violet-300">{c.svi_score}</strong></span>
                        <span>Location: <span className="text-slate-400">{c.location_label || (c.latitude ? `${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)}` : 'Unavailable')}</span></span>
                      </div>

                      {c.latest_contact && (
                        <div className="text-[10px] text-blue-300 bg-blue-950/40 border border-blue-800/40 rounded px-2 py-1">
                          Officer Contact: <span className="font-semibold">{c.latest_contact.outcome}</span> ({new Date(c.latest_contact.timestamp).toLocaleTimeString()})
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom tab bar */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 bg-slate-900/80 backdrop-blur-xl border border-slate-700 rounded-full px-2 py-2 flex gap-1 shadow-2xl">
        {tabs.map((tb) => (
          <button key={tb.key} onClick={() => setTab(tb.key)} data-testid={`tab-${tb.key}`}
            className={`px-3 py-2 rounded-full flex items-center gap-1.5 text-xs font-semibold ${tab === tb.key ? 'bg-violet-400 text-slate-900' : 'text-slate-300 hover:bg-slate-800'}`}
            style={{ transition: 'background-color 200ms, color 200ms' }}>
            <tb.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{t(lang, tb.label)}</span>
          </button>
        ))}
      </div>

      {/* SOS Confirm Modal */}
      {showSOS && (
        <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" data-testid="sos-modal">
          <div className="max-w-md w-full bg-slate-900 border border-red-500/50 rounded-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2 text-red-400 font-bold"><AlertTriangle className="w-5 h-5" /> Confirm Emergency</div>
              <button onClick={() => setShowSOS(false)}><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-slate-300 mb-3">{t(lang, 'confirmSOS')}</p>

            {/* Truthful Dispatch Notice */}
            <div className="mb-4 p-3 bg-amber-500/15 border border-amber-500/30 rounded-xl text-xs text-amber-200 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5 text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Notice: Internal Staff Alert Only</span>
              </div>
              <p className="leading-relaxed">
                NIVARA logs this incident and notifies on-duty platform officers. It does <strong>not</strong> automatically contact 112, 911, or local police.
              </p>
              <div className="pt-1 flex items-center justify-between border-t border-amber-500/20">
                <span className="text-[11px] text-amber-300">Immediate life danger?</span>
                <a
                  href="tel:112"
                  className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-xs tracking-wider inline-flex items-center gap-1"
                >
                  <Phone className="w-3 h-3" /> Call 112
                </a>
              </div>
            </div>

            <textarea value={sosMsg} onChange={(e) => setSosMsg(e.target.value)} data-testid="sos-message"
              placeholder="Optional: describe what's happening" rows={3}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm mb-4 outline-none focus:border-red-400 text-slate-100" />
            <div className="flex gap-3">
              <button onClick={() => setShowSOS(false)} className="flex-1 py-3 rounded-xl border border-slate-700 hover:bg-slate-800 text-sm">{t(lang, 'cancel')}</button>
              <button onClick={confirmSOS} data-testid="sos-confirm"
                className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-400 text-white font-bold shadow-lg shadow-red-500/30 text-sm">
                Record SOS & Alert Staff
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safe Haven Radar Modal */}
      {showRadarModal && (
        <SafeHavenRadar
          onClose={() => setShowRadarModal(false)}
          userSavedLocation={user?.saved_location}
        />
      )}

      {/* AI Safety Plan Modal */}
      {showSafetyPlanModal && (
        <AISafetyPlanModal caseId={caseId} onClose={() => setShowSafetyPlanModal(false)} />
      )}

      {/* Stealth Evidence Vault Modal */}
      {showEvidenceModal && (
        <EvidenceVaultModal caseId={caseId} onClose={() => setShowEvidenceModal(false)} />
      )}

      {/* Export Timeline Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-base">
                <FileText className="w-5 h-5" /> Evidence Report Preview
              </div>
              <button onClick={() => setShowExportModal(false)}><X className="w-5 h-5 text-slate-400 hover:text-white" /></button>
            </div>

            <div className="my-4 flex-1 overflow-y-auto space-y-3 font-mono text-xs bg-slate-950 p-4 rounded-xl border border-slate-800 text-slate-300">
              <div><b>CASE ID:</b> {caseId || 'Active Case'}</div>
              <div><b>VICTIM:</b> {user?.name}</div>
              <div><b>CURRENT SVI RISK SCORE:</b> {svi.score} / 100 ({svi.level})</div>
              <div className="pt-2 border-t border-slate-800 font-sans text-xs">
                <b>TOTAL MESSAGES:</b> {messages.length}
              </div>
              <div className="space-y-2 pt-2">
                {messages.map((m, i) => (
                  <div key={i} className="p-2 bg-slate-900/90 rounded border border-slate-800">
                    <span className="text-violet-400 font-bold">[{m.role.toUpperCase()}]</span> {m.content}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowExportModal(false)} className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-300 text-sm hover:bg-slate-800">Close</button>
              <button onClick={handleExportEvidence} className="flex-1 py-2.5 rounded-xl bg-teal-400 hover:bg-teal-300 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow">
                <Download className="w-4 h-4" /> Download Text Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Voice Consent Modal */}
      {showVoiceConsentModal && (
        <VoiceConsentModal
          onAllow={handleAllowVoiceConsent}
          onDeny={handleDenyVoiceConsent}
          onClose={() => setShowVoiceConsentModal(false)}
        />
      )}

      {/* Voice to Text Assistant Modal */}
      <VoiceAssistantModal
        isOpen={showVoiceAssistantModal}
        onClose={() => setShowVoiceAssistantModal(false)}
        onSendToChat={(text) => {
          setInput(text);
          sendText(text);
        }}
        onUseForComplaint={(text) => {
          setComplaintInitialText(text);
          setShowComplaintModal(true);
        }}
      />

      {/* Guided Complaint Modal */}
      {showComplaintModal && (
        <GuidedComplaintModal
          initialDescription={complaintInitialText}
          onClose={() => {
            setShowComplaintModal(false);
            setComplaintInitialText('');
          }}
          onComplaintLodged={(data) => {
            loadCases();
            if (data?.case_id) setCaseId(data.case_id);
            setComplaintInitialText('');
          }}
        />
      )}

      {/* Consent-Based Location Sharing Modal */}
      {showLocationConsentModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-sky-400">
              <MapPin className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">Share Your Location for Support</h3>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              With your consent, NIVARA will acquire your device's browser GPS coordinates to:
            </p>
            <ul className="text-xs text-slate-400 space-y-1.5 list-disc pl-5">
              <li>Attach verified coordinates to your active case record for duty officers</li>
              <li>Locate the nearest One Stop Centres (OSCs) and Safe Havens</li>
              <li>Provide accurate emergency distance routing if an SOS is dispatched</li>
            </ul>
            <div className="p-3 bg-sky-950/40 border border-sky-500/30 rounded-xl text-xs text-sky-300">
              🛡️ Privacy Guarantee: Coordinates are only sent after you click confirm below and are never shared publicly or without consent.
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowLocationConsentModal(false)}
                className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition"
                disabled={sharingLocation}
              >
                Cancel
              </button>
              <button
                onClick={handleShareLocationWithConsent}
                disabled={sharingLocation}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 flex items-center gap-2 transition disabled:opacity-50"
              >
                {sharingLocation ? (
                  <>
                    <Sparkles className="w-4 h-4 animate-spin" /> Acquiring GPS...
                  </>
                ) : (
                  <>
                    <MapPin className="w-4 h-4" /> Confirm & Share Location
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
