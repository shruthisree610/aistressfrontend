import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Activity, ShieldAlert, Mic, AlertTriangle, FileText, CheckCircle2, Info, Clock } from 'lucide-react';
import SVIBadge from '@/components/SVIBadge';

const formatTs = (ts) => {
  if (!ts) return null;
  try {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return null;
  }
};

export default function AIStressAssessmentSection({ detail, theme = 'dark' }) {
  const [expanded, setExpanded] = useState(true);

  if (!detail) return null;

  const hasAssessment = Boolean(
    detail.assessment ||
    detail.latest_analysis ||
    (detail.case?.svi_score != null && detail.case?.svi_score > 0)
  );

  const assessment = detail.assessment || {};
  const voice = detail.voice_analysis || null;
  const recommendations = detail.recommendations || [];
  const latestAnalysis = detail.latest_analysis || {};

  const assessmentTimestamp = assessment.timestamp || latestAnalysis.timestamp || null;
  const formattedTimestamp = formatTs(assessmentTimestamp);

  const sviScore = hasAssessment
    ? (assessment.final_svi ?? latestAnalysis.svi_score ?? detail.case?.svi_score ?? 0)
    : null;
  const riskLevel = hasAssessment
    ? (assessment.risk_level ?? latestAnalysis.risk_level ?? detail.case?.risk_level ?? 'Low')
    : 'Not assessed';

  const indicators = assessment.indicators || latestAnalysis.indicators || [];
  const scoreBreakdown = assessment.score_breakdown || [];

  const isDark = theme === 'dark';
  const bgCard = isDark ? 'bg-neutral-900 border-neutral-800 text-white' : 'bg-white border-stone-200 text-stone-900';
  const bgSub = isDark ? 'bg-neutral-950/80 border-neutral-800' : 'bg-stone-50 border-stone-200';
  const textMuted = isDark ? 'text-neutral-400' : 'text-stone-500';

  return (
    <div className={`border rounded-xl p-4 mb-4 ${bgCard}`} data-testid="ai-stress-assessment-section">
      <div 
        onClick={() => setExpanded(!expanded)} 
        className="flex items-center justify-between cursor-pointer select-none"
        data-testid="toggle-ai-assessment"
      >
        <div className="flex items-center gap-2 font-bold text-sm">
          <Activity className="w-4 h-4 text-violet-400" />
          <span>AI Stress & Vulnerability Assessment</span>
        </div>
        <div className="flex items-center gap-2">
          <SVIBadge score={sviScore} level={riskLevel} size="sm" />
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-3 border-t border-neutral-800 space-y-4 text-xs" data-testid="ai-assessment-details">
          {/* Assessment Status / Disclaimer Banner */}
          {!hasAssessment ? (
            <div className="p-2.5 rounded-lg bg-neutral-800/80 border border-neutral-700 text-neutral-300 flex items-start gap-2.5">
              <Info className="w-4 h-4 flex-shrink-0 text-neutral-400 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-semibold text-neutral-200">Assessment Pending</div>
                <div className="text-[11px] text-neutral-400">
                  This case has not yet undergone automated text or voice vulnerability assessment. SVI will be calculated once victim interactions or statements are processed.
                </div>
              </div>
            </div>
          ) : (
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span className="font-semibold">{detail.disclaimer || 'AI Recommendation — Human Review Required'}</span>
              </div>
              {formattedTimestamp && (
                <span className="text-[10px] text-amber-400/80 flex items-center gap-1 font-mono">
                  <Clock className="w-3 h-3" /> Assessed {formattedTimestamp}
                </span>
              )}
            </div>
          )}

          {/* Scores Breakdown Row */}
          <div className="grid grid-cols-3 gap-2">
            <div className={`p-3 rounded-lg border text-center ${bgSub}`} data-testid="score-text-risk">
              <div className={textMuted}>Text Risk</div>
              <div className="text-lg font-bold text-blue-400">
                {assessment.text_score != null ? (
                  assessment.text_score
                ) : latestAnalysis.text_score != null ? (
                  latestAnalysis.text_score
                ) : (
                  <span className="text-xs text-neutral-400 font-semibold">Not Assessed</span>
                )}
              </div>
            </div>
            <div className={`p-3 rounded-lg border text-center ${bgSub}`} data-testid="score-voice-stress">
              <div className={textMuted}>Voice Stress</div>
              <div className="text-lg font-bold text-violet-400">
                {assessment.voice_score != null ? (
                  assessment.voice_score
                ) : voice?.voice_stress_score != null ? (
                  voice.voice_stress_score
                ) : (
                  <span className="text-xs text-neutral-400 font-semibold">Not Assessed</span>
                )}
              </div>
            </div>
            <div className={`p-3 rounded-lg border text-center ${bgSub}`} data-testid="score-safety-severity">
              <div className={textMuted}>Safety Severity</div>
              <div className="text-lg font-bold text-red-400">
                {assessment.safety_score != null ? (
                  assessment.safety_score
                ) : (
                  <span className="text-xs text-neutral-400 font-semibold">Not Assessed</span>
                )}
              </div>
            </div>
          </div>

          {/* Note if overall SVI is established directly from emergency intake without sub-modal runs */}
          {hasAssessment && assessment.text_score == null && assessment.voice_score == null && assessment.safety_score == null && (
            <div className="p-2 bg-neutral-950 border border-neutral-800 rounded text-[11px] text-neutral-400 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 text-neutral-500 shrink-0 mt-0.5" />
              <span>Overall SVI ({sviScore} — {riskLevel}) established from emergency intake. Direct text sentiment and acoustic voice recordings are <b>Not Assessed</b> for this specific filing.</span>
            </div>
          )}


          {/* Contributing Factors Breakdown (Why SVI was generated) */}
          {scoreBreakdown.length > 0 && (
            <div className={`p-3 rounded-lg border ${bgSub}`}>
              <div className="font-semibold text-violet-300 mb-2 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" /> Contributing SVI Factors
              </div>
              <div className="space-y-1">
                {scoreBreakdown.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-[11px]">
                    <span className={textMuted}>• {item.factor}</span>
                    <span className="font-mono font-bold text-violet-400">+{item.points} pts</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Acoustic Voice Features Grid (If available) */}
          {voice && (
            <div className={`p-3 rounded-lg border ${bgSub}`} data-testid="acoustic-voice-grid">
              <div className="font-semibold text-emerald-400 mb-2 flex items-center gap-1">
                <Mic className="w-3.5 h-3.5" /> Acoustic Voice Features
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>Mean Pitch: <b className="text-white">{voice.pitch_mean || 0} Hz</b></div>
                <div>Pitch Range: <b className="text-white">{voice.pitch_range || 0} Hz</b></div>
                <div>Speech Rate: <b className="text-white">{voice.speech_rate || 0} WPM</b></div>
                <div>Pause Count: <b className="text-white">{voice.pause_count || 0}</b></div>
                <div>Avg Pause: <b className="text-white">{voice.average_pause || 0} s</b></div>
                <div>Silence Ratio: <b className="text-white">{Math.round((voice.silence_ratio || 0) * 100)}%</b></div>
              </div>
              {voice.indicators && voice.indicators.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {voice.indicators.map((ind, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/40 text-[10px]">
                      {ind}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Safety & Trauma Indicators */}
          {indicators.length > 0 && (
            <div>
              <div className={`font-semibold mb-1.5 flex items-center gap-1 ${textMuted}`}>
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" /> Detected Safety & Trauma Indicators
              </div>
              <div className="flex flex-wrap gap-1">
                {indicators.map((ind, i) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-medium">
                    {ind}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Automated Intervention Recommendations */}
          {hasAssessment && (
            <div>
              <div className={`font-semibold mb-2 flex items-center gap-1 ${textMuted}`}>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Automated Intervention Recommendations
              </div>
              {recommendations.length > 0 ? (
                <div className="space-y-1.5">
                  {recommendations.map((rec, i) => (
                    <div key={i} className={`p-2.5 rounded-lg border ${bgSub} flex flex-col gap-0.5`}>
                      <div className="flex justify-between items-center font-semibold text-slate-200">
                        <span>{rec.type}</span>
                        <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                          {rec.priority}
                        </span>
                      </div>
                      <p className={`text-[11px] ${textMuted}`}>{rec.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`p-2.5 rounded-lg border ${bgSub} text-neutral-400 text-[11px]`}>
                  {sviScore >= 75 || riskLevel === 'Critical'
                    ? 'Critical Case Protocol: Priority human officer review and immediate safety outreach required. Multi-modal protective action plan pending.'
                    : (sviScore >= 50 || riskLevel === 'High')
                    ? 'Elevated Concern Protocol: Officer review and scheduled contact recommended. Formal protective intervention assessment pending.'
                    : 'Standard case handling recommended. No immediate protective intervention escalation triggers detected.'}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
