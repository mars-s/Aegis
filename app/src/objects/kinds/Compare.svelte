<script lang="ts">
  import Text from './Text.svelte';
  let { data }: { data: { options: { name: string; detail?: string }[]; criteria: { label: string; values: string[] }[]; verdict: string } } = $props();
</script>
<div class="comparison"><table aria-label="Option comparison">
  <thead><tr><th scope="col">Criteria</th>{#each data.options as option, i}<th scope="col"><strong><Text value={option.name} label={`Option ${i + 1} name`} path={['options', i, 'name']} maxlength={60} /></strong>{#if option.detail}<p><Text value={option.detail} label={`Option ${i + 1} detail`} path={['options', i, 'detail']} multiline maxlength={160} /></p>{/if}</th>{/each}</tr></thead>
  <tbody>{#each data.criteria as criterion, r}<tr><th scope="row"><Text value={criterion.label} label={`Criterion ${r + 1}`} path={['criteria', r, 'label']} maxlength={80} /></th>{#each criterion.values as value, c}<td><Text {value} label={`Criterion ${r + 1}, option ${c + 1}`} path={['criteria', r, 'values', c]} multiline maxlength={200} /></td>{/each}</tr>{/each}</tbody>
</table></div>
<p class="verdict"><strong>Verdict</strong><Text value={data.verdict} label="Verdict" path={['verdict']} multiline maxlength={500} /></p>
<style>
  .comparison { overflow-x: auto; }
  th, td { min-width: 120px; overflow-wrap: anywhere; }
  th strong { font-size: 14px; font-weight: 500; color: var(--text); }
  th p { font-size: 12px; margin-top: 4px; }
  .verdict { display: grid; gap: 6px; margin-top: 20px; color: var(--ink-2); font-size: 13px; }
  .verdict strong { color: var(--text); font-weight: 500; }
</style>
