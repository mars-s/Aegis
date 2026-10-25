<script lang="ts">
  let { data }: { data: { options: { name: string; detail?: string }[]; criteria: { label: string; values: string[] }[]; verdict: string } } = $props();
</script>
<div class="comparison"><table aria-label="Option comparison">
  <thead><tr><th scope="col">Criteria</th>{#each data.options as option}<th scope="col"><strong>{option.name}</strong>{#if option.detail}<p>{option.detail}</p>{/if}</th>{/each}</tr></thead>
  <tbody>{#each data.criteria as criterion}<tr><th scope="row">{criterion.label}</th>{#each criterion.values as value}<td>{value}</td>{/each}</tr>{/each}</tbody>
</table></div>
<p class="verdict"><strong>Verdict</strong>{data.verdict}</p>
<style>
  .comparison { overflow-x: auto; }
  th, td { min-width: 120px; overflow-wrap: anywhere; }
  th strong { font-size: 14px; font-weight: 500; color: var(--text); }
  th p { font-size: 12px; margin-top: 4px; }
  .verdict { display: grid; gap: 6px; margin-top: 20px; color: var(--ink-2); font-size: 13px; }
  .verdict strong { color: var(--text); font-weight: 500; }
</style>
