<script lang="ts">
  type Goal = { label: string; current: number; target: number; unit?: string; editable?: boolean };
  let { data, onset }: { data: { goals: Goal[] }; onset: (path: (string | number)[], value: unknown) => void } = $props();
</script>
<ul class="goals">
  {#each data.goals as goal, i}
    <li>
      <div class="heading"><strong>{goal.label}</strong><span class="amount">{goal.current.toLocaleString('en-AU')}<span class="meta"> / {goal.target.toLocaleString('en-AU')} {goal.unit ?? ''}</span></span></div>
      <span class="track" role="meter" aria-label={goal.label} aria-valuemin="0" aria-valuemax={Math.max(goal.target, goal.current)} aria-valuenow={goal.current} aria-valuetext={`${goal.current} of ${goal.target} ${goal.unit ?? ''}`}><span style:width={`${Math.min(100, goal.current / goal.target * 100)}%`}></span></span>
      {#if goal.editable}<label class="edit"><span class="meta">Current {goal.unit ?? 'value'}</span><input type="number" min="0" step="any" value={goal.current} aria-label={`Current: ${goal.label}`} onchange={e => { if (e.currentTarget.validity.valid && e.currentTarget.value !== '') onset(['goals', i, 'current'], e.currentTarget.valueAsNumber); }} /></label>{/if}
    </li>
  {/each}
</ul>
<style>
  .goals { display: grid; gap: 24px; margin: 0; padding: 0; list-style: none; }
  .heading { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; margin-bottom: 10px; }
  strong { font-weight: 500; font-size: 14px; }
  .amount { text-align: right; white-space: nowrap; }
  .edit { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
  .edit input { width: 100px; margin-left: auto; text-align: right; }
</style>
