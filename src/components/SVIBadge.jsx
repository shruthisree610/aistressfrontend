import React from 'react';

const styles = {
  Low: 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/40',
  Moderate: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/40',
  High: 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/40',
  Critical: 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/50 animate-pulse',
  'Not assessed': 'bg-neutral-800 text-neutral-400 border-neutral-700',
  Pending: 'bg-neutral-800 text-neutral-400 border-neutral-700',
};

export default function SVIBadge({ score = 0, level, size = 'md' }) {
  const isUnassessed = level === 'Not assessed' || level === 'Pending' || level === 'unassessed' || level === 'Insufficient Data' || score === null;
  const lvl = level || (score >= 75 ? 'Critical' : score >= 50 ? 'High' : score >= 25 ? 'Moderate' : 'Low');
  const s = styles[lvl] || styles.Low;
  const sz = size === 'lg' ? 'px-3 py-1.5 text-sm' : 'px-2 py-1 text-xs';

  if (isUnassessed) {
    return (
      <span data-testid="svi-badge-not-assessed"
        className={`inline-flex items-center gap-1.5 rounded-full border font-semibold uppercase tracking-wider bg-neutral-800 text-neutral-400 border-neutral-700 ${sz}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
        SVI · {level || 'Not assessed'}
      </span>
    );
  }

  return (
    <span data-testid={`svi-badge-${lvl.toLowerCase()}`}
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold uppercase tracking-wider ${s} ${sz}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      SVI {score} · {lvl}
    </span>
  );
}

