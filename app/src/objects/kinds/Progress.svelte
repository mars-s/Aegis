<script lang="ts">
  import Value from './Value.svelte';
  type Goal = { label: string; current: number; target: number; unit?: string; editable?: boolean };
  let { data, onset }: { data: { goals: Goal[] }; onset: (path: (string | number)[], value: unknown) => void } = $props();
</script>
<ul class="goals">
  {#each data.goals as goal, i}
    <li>
      <div class="heading"><strong>{goal.label}</strong><span class="amount">{#if goal.editable}<Value value={goal.current} display={goal.current.toLocaleString('en-AU')} label={`Current: ${goal.label}`} numeric onchange={value => onset(['goals', i, 'current'], value)} />{:else}{goal.current.toLocaleString('en-AU')}{/if}<span class="meta"> / {goal.target.toLocaleString('en-AU')} {goal.unit ?? ''}</span></span></div>
      <span class="track" role="meter" aria-label={goal.label} aria-valuemin="0" aria-valuemax={Math.max(goal.target, goal.current)} aria-valuenow={goal.current} aria-valuetext={`${goal.current} of ${goal.target} ${goal.unit ?? ''}`}><span style:width={`${Math.min(100, goal.current / goal.target * 100)}%`}></span></span>
    </li>
  {/each}
</ul>
<style>
  .goals { display: grid; gap: 24px; margin: 0; padding: 0; list-style: none; }
  .heading { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; margin-bottom: 10px; }
  strong { font-weight: 500; font-size: 14px; }
  .amount { text-align: right; white-space: nowrap; }
</style>
