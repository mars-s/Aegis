// Intervals come from the scene recorder, or the separate native refresh probe.
export function frameStats(intervals, targetHz = 120) {
  if (!intervals.length || intervals.some(ms => !Number.isFinite(ms) || ms <= 0)) throw new Error('Expected positive frame intervals');
  if (!Number.isFinite(targetHz) || targetHz <= 0) throw new Error('Expected a positive refresh rate');
  const sorted = [...intervals].sort((a, b) => a - b);
  const percentile = fraction => sorted[Math.ceil(sorted.length * fraction) - 1];
  const total = intervals.reduce((sum, ms) => sum + ms, 0);
  const within12_5Ms = intervals.filter(ms => ms <= 12.5).length;
  const droppedFrames = intervals.reduce((sum, ms) => sum + Math.max(0, Math.round(ms * targetHz / 1000) - 1), 0);
  return {
    frames: intervals.length, fps: 1000 * intervals.length / total,
    p50: percentile(0.5), p95: percentile(0.95), max: sorted.at(-1),
    within12_5Ms, within12_5MsPercent: 100 * within12_5Ms / intervals.length,
    targetHz, droppedFrames, droppedPercent: 100 * droppedFrames / (intervals.length + droppedFrames),
  };
}

export function replayPasses(report) {
  return report.p50 <= 9 && report.within12_5MsPercent >= 95;
}
