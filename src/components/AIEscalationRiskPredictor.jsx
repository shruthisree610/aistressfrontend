import React, { useEffect, useState } from 'react';
import { TrendingUp, AlertTriangle, Clock, Activity, ShieldAlert, Zap, Info } from 'lucide-react';
import { api } from '@/lib/api';

export default function AIEscalationRiskPredictor({ caseId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setData(null);
    if (caseId) {
      setLoading(true);
      loadPrediction(caseId);
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const loadPrediction = async (id) => {
    try {
      const res = await api.get(`/analytics/escalation-risk/${id}`);
      setData(res.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-xl text-xs text-neutral-400 flex items-center gap-2">
        <Activity className="w-3.5 h-3.5 animate-spin text-neutral-500" />
        <span>Loading AI Risk Forecast...</span>
      </div>
    );
  }

  if (!data) return null;

  // Unassessed / Insufficient Data State
  if (data.has_sufficient_data === false) {
    return (
      <div className="p-3 bg-neutral-900/90 border border-neutral-800 rounded-xl space-y-2.5 shadow-lg" data-testid="escalation-forecast-insufficient">
        <div className="flex justify-between items-center border-b border-neutral-800 pb-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-400">
            <Zap className="w-3.5 h-3.5 text-neutral-500" />
            <span>AI ESCALATION RISK FORECAST (24-48H)</span>
          </div>
          <span className="text-[10px] font-mono bg-neutral-800 text-neutral-400 border border-neutral-700 px-2 py-0.5 rounded-full font-bold">
            INSUFFICIENT DATA
          </span>
        </div>
        <div className="p-2.5 bg-neutral-950 rounded-lg border border-neutral-800 text-xs text-neutral-400 flex items-start gap-2">
          <Info className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-neutral-300">Predictive Modeling Inactive</div>
            <p className="text-[11px] leading-relaxed text-neutral-400">
              {data.message || 'Insufficient multi-modal assessment or interaction history to compute predictive trajectory. Initial triage interview or assessment required.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isCritical = data.predicted_threat_level?.includes('CRITICAL');
  const isHigh = data.predicted_threat_level?.includes('HIGH');
  const isElevated = data.predicted_threat_level?.includes('ELEVATED');
  const badgeColor = isCritical || isHigh
    ? 'bg-red-500/20 text-red-300 border-red-500/40'
    : isElevated
    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';

  return (
    <div className="p-3 bg-neutral-900/90 border border-red-500/30 rounded-xl space-y-3 shadow-lg" data-testid="ai-escalation-risk-predictor">
      <div className="flex justify-between items-center border-b border-neutral-800 pb-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-red-400">
          <Zap className="w-3.5 h-3.5 text-red-400 animate-pulse" />
          <span>AI ESCALATION RISK FORECAST (24-48H)</span>
        </div>
        <span className={`text-[10px] font-mono border px-2 py-0.5 rounded-full font-bold ${badgeColor}`}>
          {data.predicted_threat_level}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-neutral-950 p-2 rounded-lg border border-neutral-800">
          <div className="text-[10px] text-neutral-500 uppercase">Escalation Velocity</div>
          <div className="text-sm font-black text-amber-400 mt-0.5">{data.escalation_velocity}</div>
        </div>
        <div className="bg-neutral-950 p-2 rounded-lg border border-neutral-800">
          <div className="text-[10px] text-neutral-500 uppercase">Danger Window</div>
          <div className="text-xs font-bold text-red-300 mt-0.5 leading-snug">{data.danger_window_hours}</div>
        </div>
      </div>

      {/* 24-48H Predictive Timeline Curve */}
      <div className="bg-neutral-950 p-2.5 rounded-lg border border-neutral-800 space-y-2">
        <div className="text-[10px] font-bold text-neutral-400 uppercase flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
            <span>SVI Trajectory & Predictive Modeling</span>
          </span>
          <div className="flex items-center gap-2">
            {data.current_svi != null && (
              <span className="text-white font-mono font-bold bg-neutral-800 px-1.5 py-0.5 rounded">
                Current: {data.current_svi}
              </span>
            )}
            <span className="text-amber-400 font-mono font-bold">{data.trajectory_pct}</span>
          </div>
        </div>

        {/* Trajectory Graph Container with Fixed Height so bars never collapse */}
        <div className="pt-2">
          <div className="h-20 flex items-end justify-between gap-2 px-1 pb-1 border-b border-neutral-800">
            {data.risk_curve?.map((pt, i) => {
              const isForecast = pt.time.includes('Forecast');
              const barHeight = Math.max(6, Math.min(56, Math.round((pt.score / 100) * 56)));
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                  <span className={`text-[9px] font-mono font-bold mb-1 ${isForecast ? 'text-rose-300' : 'text-neutral-200'}`}>
                    {pt.score}
                  </span>
                  <div
                    className={`w-full rounded-t transition-all ${
                      isForecast
                        ? 'bg-gradient-to-t from-red-600 to-rose-400 border-t border-rose-300'
                        : 'bg-gradient-to-t from-neutral-700 to-blue-400'
                    }`}
                    style={{ height: `${barHeight}px` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between gap-2 px-1 pt-1.5">
            {data.risk_curve?.map((pt, i) => {
              const isForecast = pt.time.includes('Forecast');
              return (
                <div key={i} className="flex-1 text-center">
                  <span className={`block text-[9px] font-mono font-semibold ${isForecast ? 'text-rose-400' : 'text-neutral-300'}`}>
                    {pt.time.replace(' (Forecast)', '')}
                  </span>
                  <span className="block text-[8px] uppercase tracking-wider text-neutral-500 font-mono">
                    {isForecast ? 'Forecast' : (i === 0 ? 'Baseline' : 'Recorded')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Primary Threat Risk Factors */}
      {data.risk_factors && data.risk_factors.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] text-neutral-400 uppercase font-semibold">Top Threat Drivers:</div>
          {data.risk_factors.map((rf, idx) => (
            <div key={idx} className="flex justify-between items-center text-[11px] text-neutral-300">
              <span>• {rf.factor}</span>
              <span className="font-mono text-red-400 font-bold">{rf.weight}</span>
            </div>
          ))}
        </div>
      )}

      {/* Recommended Action */}
      {data.recommended_action && (
        <div className="p-2 bg-neutral-950 rounded border border-neutral-800 text-[11px] text-neutral-300 flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span><b>Recommended Protocol:</b> {data.recommended_action}</span>
        </div>
      )}
    </div>
  );
}

