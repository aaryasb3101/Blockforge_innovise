import React, { useEffect, useState } from 'react';
import { Verdict } from '@shared/types';

interface TrustGaugeProps {
  score: number;
  verdict: Verdict;
  size?: number;
}

export const TrustGauge: React.FC<TrustGaugeProps> = ({
  score,
  verdict,
  size = 180,
}) => {
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedScore(score);
    }, 50);
    return () => clearTimeout(timer);
  }, [score]);

  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // Arc 240 degrees (from 150deg to 390deg)
  const arcLength = circumference * 0.75;
  const progressOffset =
    arcLength - (Math.min(100, Math.max(0, animatedScore)) / 100) * arcLength;

  // Colors per spec
  let strokeColor = '#10b981'; // trust-valid
  let textColor = 'text-emerald-400';
  let bgGlow = 'rgba(16, 185, 129, 0.2)';

  if (verdict === Verdict.VALID_WITH_WARNINGS) {
    strokeColor = '#f59e0b'; // trust-warning
    textColor = 'text-amber-400';
    bgGlow = 'rgba(245, 158, 11, 0.2)';
  } else if (verdict === Verdict.SUSPICIOUS) {
    strokeColor = '#f97316'; // trust-suspicious
    textColor = 'text-orange-400';
    bgGlow = 'rgba(249, 115, 22, 0.2)';
  } else if (verdict === Verdict.INVALID) {
    strokeColor = '#ef4444'; // trust-invalid
    textColor = 'text-rose-500';
    bgGlow = 'rgba(239, 68, 68, 0.2)';
  }

  return (
    <div className="relative flex flex-col items-center justify-center p-2">
      <div
        className="relative flex items-center justify-center rounded-full transition-shadow duration-700"
        style={{
          width: size,
          height: size,
          filter: `drop-shadow(0 0 16px ${bgGlow})`,
        }}
      >
        <svg
          width={size}
          height={size}
          className="transform -rotate-135 transition-transform duration-700"
        >
          {/* Background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
            className="text-surface-border opacity-60"
          />
          {/* Animated progress arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={progressOffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[11px] font-bold tracking-wider uppercase text-surface-muted">
            Trust Score
          </span>
          <span
            className={`text-4xl font-black tracking-tight font-mono ${textColor} transition-colors duration-500`}
          >
            {animatedScore}
          </span>
          <span className="text-[10px] font-mono text-surface-muted">/100</span>
        </div>
      </div>
    </div>
  );
};
