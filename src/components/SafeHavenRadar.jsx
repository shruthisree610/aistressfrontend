import React, { useEffect, useState, useCallback } from 'react';
import {
  Shield,
  Navigation,
  Phone,
  MapPin,
  Radio,
  X,
  AlertTriangle,
  Info,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Filter,
  Compass,
  LocateFixed,
  Globe,
  Building2,
  Home
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { getUserLocation } from '@/lib/location';

export default function SafeHavenRadar({ onClose, userSavedLocation = '' }) {
  const [havens, setHavens] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [locationSource, setLocationSource] = useState('unavailable'); // 'live_gps' | 'saved_profile' | 'manual' | 'unavailable'
  const [locationAccuracy, setLocationAccuracy] = useState(null);
  const [locationTimestamp, setLocationTimestamp] = useState(null);
  const [isRefreshingLocation, setIsRefreshingLocation] = useState(false);

  const [providerId, setProviderId] = useState('osc_directory'); // 'osc_directory' | 'openstreetmap' | 'all' | 'demo'
  const [radiusKm, setRadiusKm] = useState(50); // 5 | 10 | 25 | 50 | 100 | 'all'
  const [isVerifiedProvider, setIsVerifiedProvider] = useState(true);
  const [providerName, setProviderName] = useState('');
  const [providerNotice, setProviderNotice] = useState('');

  const [coverageNotice, setCoverageNotice] = useState('');
  const [isLocalCoverageLimited, setIsLocalCoverageLimited] = useState(false);
  const [withinRadiusCount, setWithinRadiusCount] = useState(0);
  const [nearestDistanceKm, setNearestDistanceKm] = useState(null);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [selectedType, setSelectedType] = useState('all');
  const [selectedHaven, setSelectedHaven] = useState(null);

  // Manual Coordinate Input Modal
  const [showManualCoordModal, setShowManualCoordModal] = useState(false);
  const [manualLatInput, setManualLatInput] = useState('');
  const [manualLngInput, setManualLngInput] = useState('');

  // Initial Location & Havens Load
  useEffect(() => {
    initLocationAndHavens();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolveCoordinatesFromProfile = (locationStr) => {
    if (!locationStr) return null;
    const lower = locationStr.toLowerCase();
    if (lower.includes('siruseri') || lower.includes('kelambakkam') || lower.includes('omr') || lower.includes('chengalpattu')) {
      return { lat: 12.8353, lng: 80.2190, label: `Profile: ${locationStr}` };
    }
    if (lower.includes('chennai') || lower.includes('triplicane') || lower.includes('adyar') || lower.includes('anna nagar')) {
      return { lat: 13.0827, lng: 80.2707, label: `Profile: ${locationStr}` };
    }
    if (lower.includes('bengaluru') || lower.includes('bangalore') || lower.includes('indiranagar') || lower.includes('koramangala')) {
      return { lat: 12.9716, lng: 77.5946, label: `Profile: ${locationStr}` };
    }
    if (lower.includes('delhi') || lower.includes('noida') || lower.includes('gurgaon')) {
      return { lat: 28.6139, lng: 77.2090, label: `Profile: ${locationStr}` };
    }
    if (lower.includes('mumbai') || lower.includes('pune') || lower.includes('bandra')) {
      return { lat: 19.0760, lng: 72.8777, label: `Profile: ${locationStr}` };
    }
    if (lower.includes('hyderabad') || lower.includes('secunderabad')) {
      return { lat: 17.3850, lng: 78.4867, label: `Profile: ${locationStr}` };
    }
    return null;
  };

  const initLocationAndHavens = async () => {
    setLoading(true);
    let loc = null;
    try {
      loc = await getUserLocation({ enableHighAccuracy: true, maximumAge: 5000, timeout: 8000 });
      if (loc && loc.has_location) {
        setUserLocation(loc);
        setLocationSource('live_gps');
        setLocationAccuracy(loc.accuracy ? Math.round(loc.accuracy) : null);
        setLocationTimestamp(new Date(loc.timestamp || Date.now()).toLocaleTimeString());
      } else {
        // Fallback check: does user have a registered residence?
        const resolved = resolveCoordinatesFromProfile(userSavedLocation);
        if (resolved) {
          loc = {
            has_location: true,
            latitude: resolved.lat,
            longitude: resolved.lng,
            location_label: `Saved Profile Residence (${userSavedLocation})`,
            accuracy: null,
            source: 'saved_profile',
            timestamp: Date.now()
          };
          setUserLocation(loc);
          setLocationSource('saved_profile');
          setLocationAccuracy(null);
          setLocationTimestamp(new Date().toLocaleTimeString());
        } else {
          setUserLocation(loc);
          setLocationSource('unavailable');
        }
      }
    } catch (e) {
      console.warn('Initial location acquisition failed:', e);
      setLocationSource('unavailable');
    }

    await loadHavens(providerId, loc, radiusKm);
  };

  const loadHavens = useCallback(async (currentProvider = providerId, loc = userLocation, currentRadius = radiusKm) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const radiusParam = currentRadius === 'all' ? 500 : currentRadius;
      let queryUrl = `/safe-havens?provider=${currentProvider}&radius_km=${radiusParam}`;
      if (loc && loc.has_location && loc.latitude != null && loc.longitude != null) {
        queryUrl += `&lat=${loc.latitude}&lng=${loc.longitude}`;
      }
      const { data } = await api.get(queryUrl);
      setHavens(data.havens || []);
      setProviderNotice(data.provider_notice || '');
      setIsVerifiedProvider(data.verified_provider_configured ?? false);
      setProviderName(data.provider_name || '');
      setCoverageNotice(data.coverage_notice || '');
      setIsLocalCoverageLimited(data.is_local_coverage_limited ?? false);
      setWithinRadiusCount(data.within_radius_count ?? (data.havens || []).length);
      setNearestDistanceKm(data.nearest_distance_km ?? null);
    } catch (e) {
      console.warn('Safe-haven query error, falling back:', e);
      try {
        const { data } = await api.get(`/safe-havens?provider=${currentProvider}`);
        setHavens(data.havens || []);
        setProviderNotice(data.provider_notice || '');
        setIsVerifiedProvider(data.verified_provider_configured ?? false);
        setProviderName(data.provider_name || '');
        setCoverageNotice(data.coverage_notice || '');
        setIsLocalCoverageLimited(data.is_local_coverage_limited ?? false);
      } catch (err) {
        setErrorMessage('Failed to connect to the Safe Haven data provider. Please check your network or try again.');
        toast.error('Could not load safe-haven data');
      }
    } finally {
      setLoading(false);
    }
  }, [providerId, userLocation, radiusKm]);

  const handleRefreshLocation = async () => {
    setIsRefreshingLocation(true);
    try {
      const loc = await getUserLocation({ enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
      if (loc && loc.has_location) {
        const timeStr = new Date(loc.timestamp || Date.now()).toLocaleTimeString();
        setUserLocation(loc);
        setLocationSource('live_gps');
        setLocationAccuracy(loc.accuracy ? Math.round(loc.accuracy) : null);
        setLocationTimestamp(timeStr);
        toast.success(`Live GPS refreshed: ${loc.location_label} (±${Math.round(loc.accuracy || 0)}m)`);
        await loadHavens(providerId, loc, radiusKm);
      } else {
        toast.warning(loc?.error?.message || 'GPS location unavailable. Please verify site location permissions.');
        setLocationSource('unavailable');
      }
    } catch (err) {
      toast.error('Failed to acquire live GPS position');
      setLocationSource('unavailable');
    } finally {
      setIsRefreshingLocation(false);
    }
  };

  const handleUseSavedResidence = async () => {
    if (!userSavedLocation) {
      toast.info('No saved residence found in your profile.');
      return;
    }
    const resolved = resolveCoordinatesFromProfile(userSavedLocation);
    if (resolved) {
      const loc = {
        has_location: true,
        latitude: resolved.lat,
        longitude: resolved.lng,
        location_label: `Saved Profile Residence (${userSavedLocation})`,
        accuracy: null,
        source: 'saved_profile',
        timestamp: Date.now()
      };
      setUserLocation(loc);
      setLocationSource('saved_profile');
      setLocationAccuracy(null);
      setLocationTimestamp(new Date().toLocaleTimeString());
      toast.info(`Using saved residence coordinates: ${userSavedLocation}`);
      await loadHavens(providerId, loc, radiusKm);
    } else {
      setShowManualCoordModal(true);
      toast.info(`Please enter coordinates for "${userSavedLocation}"`);
    }
  };

  const handleManualCoordSubmit = async (e) => {
    if (e) e.preventDefault();
    const lat = parseFloat(manualLatInput);
    const lng = parseFloat(manualLngInput);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      toast.error('Please enter valid latitude (-90 to 90) and longitude (-180 to 180).');
      return;
    }
    const loc = {
      has_location: true,
      latitude: lat,
      longitude: lng,
      location_label: `Manual Coordinates (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      accuracy: null,
      source: 'manual',
      timestamp: Date.now()
    };
    setUserLocation(loc);
    setLocationSource('manual');
    setLocationAccuracy(null);
    setLocationTimestamp(new Date().toLocaleTimeString());
    setShowManualCoordModal(false);
    toast.success('Manual coordinates set successfully');
    await loadHavens(providerId, loc, radiusKm);
  };

  const handleProviderSwitch = (newProvider) => {
    setProviderId(newProvider);
    loadHavens(newProvider, userLocation, radiusKm);
  };

  const handleRadiusChange = (newRadius) => {
    setRadiusKm(newRadius);
    loadHavens(providerId, userLocation, newRadius);
  };

  const startNavigation = (haven) => {
    if (!haven.latitude || !haven.longitude) {
      toast.error('Exact coordinates unavailable for this shelter.');
      return;
    }
    toast.info(`Opening navigation to: ${haven.name}. Contact intake before traveling.`);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${haven.latitude},${haven.longitude}`, '_blank');
  };

  // Filter items by type and radius
  const filteredHavens = havens.filter((h) => {
    if (selectedType !== 'all') {
      if (selectedType === 'one_stop_centre' && !(h.type === 'one_stop_centre' || h.type === 'shelter')) return false;
      if (selectedType === 'police' && h.type !== 'police') return false;
      if (selectedType === 'hospital' && h.type !== 'hospital') return false;
      if (selectedType === 'legal_aid' && h.type !== 'legal_aid') return false;
    }
    if (radiusKm !== 'all' && h.distance_km != null) {
      if (h.distance_km > Number(radiusKm)) {
        // If there are facilities within radius, filter out beyond-radius items.
        // If 0 facilities within radius, keep the nearest so the user still sees their options.
        if (withinRadiusCount > 0) {
          return false;
        }
      }
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4">
      <div className="max-w-3xl w-full bg-slate-900 border border-slate-700/80 rounded-3xl p-4 sm:p-6 shadow-2xl flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                isVerifiedProvider
                  ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-400'
                  : providerId === 'demo'
                  ? 'bg-amber-500/20 border-amber-400/40 text-amber-400'
                  : 'bg-cyan-500/20 border-cyan-400/40 text-cyan-400'
              }`}
            >
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base sm:text-lg text-white">Safe Haven Support Directory</h2>
                <span
                  className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                    isVerifiedProvider
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : providerId === 'demo'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  }`}
                >
                  {isVerifiedProvider
                    ? 'Verified Directory'
                    : providerId === 'demo'
                    ? 'Demo Data'
                    : providerId === 'all'
                    ? 'Aggregated Sources'
                    : 'Community Data'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {isVerifiedProvider
                  ? 'Official Government One Stop Centres & Crisis Hubs'
                  : providerId === 'demo'
                  ? 'Curated demonstration sample shelters for testing'
                  : providerId === 'all'
                  ? 'Government One Stop Centres & OpenStreetMap Community Points'
                  : 'OpenStreetMap community-mapped crisis & emergency facilities'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Source Provider Tabs */}
        <div className="my-2.5 flex items-center gap-1.5 p-1 bg-slate-950/70 border border-slate-800 rounded-2xl text-xs overflow-x-auto">
          <button
            onClick={() => handleProviderSwitch('osc_directory')}
            className={`flex-1 py-1.5 px-2.5 rounded-xl font-medium transition text-center whitespace-nowrap ${
              providerId === 'osc_directory'
                ? 'bg-emerald-600/30 text-emerald-200 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            🏛️ Official Government (MWCD)
          </button>
          <button
            onClick={() => handleProviderSwitch('openstreetmap')}
            className={`flex-1 py-1.5 px-2.5 rounded-xl font-medium transition text-center whitespace-nowrap ${
              providerId === 'openstreetmap'
                ? 'bg-cyan-600/30 text-cyan-200 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            🗺️ OpenStreetMap Community
          </button>
          <button
            onClick={() => handleProviderSwitch('all')}
            className={`flex-1 py-1.5 px-2.5 rounded-xl font-medium transition text-center whitespace-nowrap ${
              providerId === 'all'
                ? 'bg-indigo-600/30 text-indigo-200 border border-indigo-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            🔄 Combined View
          </button>
          <button
            onClick={() => handleProviderSwitch('demo')}
            className={`flex-1 py-1.5 px-2.5 rounded-xl font-medium transition text-center whitespace-nowrap ${
              providerId === 'demo'
                ? 'bg-amber-600/30 text-amber-200 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            🧪 Demo Mode
          </button>
        </div>

        {/* Truthful Location Bar & Controls */}
        <div className="mb-2.5 p-2.5 bg-slate-950/90 border border-slate-800 rounded-2xl space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 truncate">
              {locationSource === 'live_gps' ? (
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              ) : locationSource === 'saved_profile' ? (
                <Home className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              ) : locationSource === 'manual' ? (
                <Compass className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              )}

              <span className="font-semibold text-slate-200 truncate">
                {locationSource === 'live_gps'
                  ? `Live GPS (${userLocation.latitude?.toFixed(4)}, ${userLocation.longitude?.toFixed(4)})`
                  : locationSource === 'saved_profile'
                  ? userLocation?.location_label || 'Saved Profile Residence (Non-GPS)'
                  : locationSource === 'manual'
                  ? userLocation?.location_label || 'Manual Coordinates (Non-GPS)'
                  : 'Location Unavailable (Permissions Denied or No Signal)'}
              </span>

              {locationAccuracy != null && (
                <span className="text-[11px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 font-mono">
                  ±{locationAccuracy}m
                </span>
              )}
              {locationTimestamp && (
                <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
                  Updated: {locationTimestamp}
                </span>
              )}
            </div>

            {/* Location Action Buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleRefreshLocation}
                disabled={isRefreshingLocation}
                className="px-2.5 py-1 bg-teal-600/30 hover:bg-teal-600/50 text-teal-200 border border-teal-500/40 rounded-xl text-xs font-semibold inline-flex items-center gap-1 transition"
                title="Acquire current position from browser GPS"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshingLocation ? 'animate-spin' : ''}`} />
                <span>Refresh GPS</span>
              </button>

              {userSavedLocation && locationSource !== 'saved_profile' && (
                <button
                  onClick={handleUseSavedResidence}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-medium inline-flex items-center gap-1 transition"
                  title={`Use saved residence: ${userSavedLocation}`}
                >
                  <Home className="w-3 h-3 text-blue-400" />
                  <span className="hidden sm:inline">Use Profile:</span>
                  <span className="truncate max-w-[90px]">{userSavedLocation}</span>
                </button>
              )}

              <button
                onClick={() => setShowManualCoordModal(true)}
                className="px-2 py-1 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-xl text-xs transition"
                title="Enter custom coordinates"
              >
                <MapPin className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Search Radius Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/60 text-xs">
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <Compass className="w-3 h-3 text-teal-400" />
              <span>Search Radius:</span>
              {[5, 10, 25, 50, 100, 'all'].map((r) => (
                <button
                  key={r}
                  onClick={() => handleRadiusChange(r)}
                  className={`px-2 py-0.5 rounded-lg font-medium transition ${
                    radiusKm === r
                      ? 'bg-teal-500/30 text-teal-200 border border-teal-400/50 shadow-sm'
                      : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  {r === 'all' ? 'All India' : `${r} km`}
                </button>
              ))}
            </div>

            <span className="text-[11px] text-slate-500 font-mono">
              {userLocation?.has_location ? 'Haversine Straight-line Distance' : 'Distance unavailable'}
            </span>
          </div>
        </div>

        {/* Limited Local Coverage Notice Banner */}
        {isLocalCoverageLimited && userLocation?.has_location && providerId === 'osc_directory' && (
          <div className="p-3 bg-amber-500/15 border border-amber-500/40 rounded-2xl text-xs space-y-2 mb-2.5 animate-fadeIn">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-200">No Official MWCD Centre Within {radiusKm} km</p>
                <p className="text-amber-300/90 text-[11px] leading-relaxed mt-0.5">
                  {coverageNotice ||
                    `No government One Stop Centre is listed within ${radiusKm} km. The nearest centre is ${nearestDistanceKm} km away.`}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-500/20">
              <button
                onClick={() => handleProviderSwitch('openstreetmap')}
                className="px-2.5 py-1 bg-cyan-600/40 hover:bg-cyan-600/60 text-cyan-200 border border-cyan-500/40 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition"
              >
                <Globe className="w-3 h-3" /> Search OpenStreetMap (Local Police & Hospitals)
              </button>
              {radiusKm !== 100 && radiusKm !== 'all' && (
                <button
                  onClick={() => {
                    const nextR = radiusKm === 5 || radiusKm === 10 ? 25 : radiusKm === 25 ? 50 : 100;
                    handleRadiusChange(nextR);
                  }}
                  className="px-2.5 py-1 bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 border border-amber-500/40 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition"
                >
                  <Compass className="w-3 h-3" /> Expand Radius to{' '}
                  {radiusKm === 5 || radiusKm === 10 ? '25' : radiusKm === 25 ? '50' : '100'} km
                </button>
              )}
            </div>
          </div>
        )}

        {/* Truthfulness & Emergency Helplines Notice */}
        <div
          className={`p-3 rounded-2xl text-xs space-y-2 mb-2.5 border ${
            isVerifiedProvider
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
              : providerId === 'demo'
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
              : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200'
          }`}
        >
          <div className="flex items-start gap-2">
            {isVerifiedProvider ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="leading-relaxed">
              <strong>{isVerifiedProvider ? 'Verified Directory Notice: ' : 'Unverified/Community Notice: '}</strong>
              {providerNotice ||
                'Directory listings provide contact and location details. Immediate bed/room availability is NOT tracked online in real time.'}
            </div>
          </div>
          <div className="pt-2 border-t border-slate-700/50 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-slate-300">Immediate threat or crisis dispatch? Call directly:</span>
            <div className="flex items-center gap-2">
              <a
                href="tel:112"
                className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-xs inline-flex items-center gap-1 shadow"
              >
                <Phone className="w-3 h-3" /> 112 (ERSS)
              </a>
              <a
                href="tel:181"
                className="px-2.5 py-1 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-lg text-xs inline-flex items-center gap-1 shadow"
              >
                <Phone className="w-3 h-3" /> 181 (Women)
              </a>
              <a
                href="tel:1091"
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs inline-flex items-center gap-1 shadow"
              >
                <Phone className="w-3 h-3" /> 1091 (Police)
              </a>
            </div>
          </div>
        </div>

        {/* Category Filters */}
        <div className="mb-2.5 flex items-center gap-1 overflow-x-auto pb-1 text-[11px]">
          <span className="text-slate-500 flex items-center gap-1 mr-1 shrink-0">
            <Filter className="w-3 h-3" /> Filter:
          </span>
          {[
            { id: 'all', label: 'All Centers' },
            { id: 'one_stop_centre', label: 'One Stop Centres' },
            { id: 'police', label: 'Police Help Desks' },
            { id: 'hospital', label: 'Medical Aid / Hospitals' },
            { id: 'legal_aid', label: 'Legal Aid' }
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedType(cat.id)}
              className={`px-2.5 py-1 rounded-lg font-medium transition shrink-0 ${
                selectedType === cat.id
                  ? 'bg-teal-500/20 text-teal-300 border border-teal-400/40'
                  : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* List of Havens */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
          {loading ? (
            <div className="text-center py-12 text-slate-400 text-sm flex flex-col items-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-teal-400" />
              <span>Querying verified Safe Haven providers...</span>
            </div>
          ) : errorMessage ? (
            <div className="text-center py-12 px-4 space-y-3">
              <p className="text-red-400 text-sm">{errorMessage}</p>
              <button
                onClick={() => loadHavens(providerId, userLocation, radiusKm)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry Query
              </button>
            </div>
          ) : filteredHavens.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm space-y-3">
              <Building2 className="w-8 h-8 text-slate-600 mx-auto" />
              <p>No facilities matched the current provider, radius, or category filter.</p>
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => handleProviderSwitch('openstreetmap')}
                  className="px-3 py-1.5 bg-cyan-600/40 hover:bg-cyan-600/60 text-cyan-200 rounded-xl text-xs font-semibold inline-flex items-center gap-1"
                >
                  <Globe className="w-3.5 h-3.5" /> Search OpenStreetMap
                </button>
                <button
                  onClick={() => handleRadiusChange('all')}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  View All India Centres
                </button>
              </div>
              <p className="text-xs text-slate-500">In an immediate emergency, please dial 112 or 181 directly.</p>
            </div>
          ) : (
            filteredHavens.map((haven) => {
              const isBeyondRadius = radiusKm !== 'all' && haven.distance_km != null && haven.distance_km > Number(radiusKm);

              return (
                <div
                  key={haven.id}
                  onClick={() => setSelectedHaven(haven)}
                  className={`p-3.5 rounded-2xl border transition cursor-pointer ${
                    selectedHaven?.id === haven.id
                      ? 'bg-slate-800/90 border-teal-400/80 shadow-lg shadow-teal-500/10'
                      : isBeyondRadius
                      ? 'bg-slate-950/40 border-slate-800/60 hover:bg-slate-900/60 opacity-90'
                      : 'bg-slate-950/70 border-slate-800/80 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                            haven.type === 'police'
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-400/30'
                              : haven.type === 'one_stop_centre' || haven.type === 'shelter'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                              : haven.type === 'hospital'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-400/30'
                              : 'bg-purple-500/20 text-purple-300 border border-purple-400/30'
                          }`}
                        >
                          {haven.type.replace(/_/g, ' ')}
                        </span>
                        {haven.is_verified_source ? (
                          <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md font-medium inline-flex items-center gap-0.5">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Verified Directory
                          </span>
                        ) : haven.source_type === 'demonstration' ? (
                          <span className="text-[10px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md font-medium">
                            Demo Sample
                          </span>
                        ) : (
                          <span className="text-[10px] text-cyan-400/90 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded-md font-medium">
                            Community Data
                          </span>
                        )}

                        {haven.distance_km != null ? (
                          <span
                            className={`text-xs font-semibold ${
                              isBeyondRadius ? 'text-amber-400' : 'text-teal-300'
                            }`}
                          >
                            {haven.distance_km} km away (straight-line)
                            {isBeyondRadius && (
                              <span className="text-[10px] text-amber-400/80 font-normal ml-1">
                                (Beyond {radiusKm} km radius)
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500 italic">Distance unavailable</span>
                        )}
                      </div>
                      <h3 className="font-bold text-slate-100 text-sm mt-1">{haven.name}</h3>
                      <p className="text-xs text-slate-400 mt-0.5 flex items-start gap-1">
                        <MapPin className="w-3 h-3 text-slate-500 shrink-0 mt-0.5" />
                        <span>{haven.address || 'Address on file'}</span>
                      </p>
                    </div>

                    <div className="text-right text-xs shrink-0">
                      <span className="text-[11px] text-slate-400 block font-mono">
                        {haven.operating_hours || 'Hours unverified'}
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        {haven.district || haven.state || ''}
                      </span>
                    </div>
                  </div>

                  {/* Services Tags */}
                  {haven.services && haven.services.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {haven.services.map((svc, i) => (
                        <span
                          key={i}
                          className="text-[10px] bg-slate-800/80 text-slate-300 px-2 py-0.5 rounded-md border border-slate-700/50"
                        >
                          {svc}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Truthful Bed Availability Notice */}
                  <div className="mt-2 px-2.5 py-1 bg-slate-900/90 border border-slate-800 rounded-lg flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Info className="w-3 h-3 text-teal-400 shrink-0" />
                      <strong>Bed Vacancy:</strong> {haven.bed_availability || 'Unknown — Call ahead'}
                    </span>
                    <span className="text-[10px] text-slate-500 italic">Call before traveling</span>
                  </div>

                  {/* Action Bar */}
                  <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      {haven.phone && (
                        <a
                          href={`tel:${haven.phone.split('/')[0].trim()}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-teal-300 hover:text-teal-200 font-semibold inline-flex items-center gap-1 bg-teal-500/10 px-2 py-1 rounded-lg border border-teal-500/20"
                        >
                          <Phone className="w-3 h-3" /> {haven.phone}
                        </a>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startNavigation(haven);
                      }}
                      className="px-3 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow transition shrink-0"
                    >
                      <Navigation className="w-3.5 h-3.5" /> Navigate
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
          <div className="text-[11px] text-slate-500">
            Source: <span className="text-slate-400">{providerName || 'NIVARA Safe Haven Service'}</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
          >
            Close Radar
          </button>
        </div>
      </div>

      {/* Manual Coordinate Entry Modal */}
      {showManualCoordModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="max-w-sm w-full bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-teal-400" /> Set Custom Coordinates
              </h3>
              <button
                onClick={() => setShowManualCoordModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              If GPS is unavailable, enter latitude and longitude manually to find nearest safe havens.
            </p>
            <form onSubmit={handleManualCoordSubmit} className="space-y-3">
              <div>
                <label className="text-[11px] text-slate-400 font-medium block mb-1">Latitude (-90 to 90)</label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 12.8353"
                  value={manualLatInput}
                  onChange={(e) => setManualLatInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 font-mono focus:border-teal-400 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 font-medium block mb-1">Longitude (-180 to 180)</label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 80.2190"
                  value={manualLngInput}
                  onChange={(e) => setManualLngInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 font-mono focus:border-teal-400 focus:outline-none"
                  required
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualCoordModal(false)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl text-xs transition"
                >
                  Apply Coordinates
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
