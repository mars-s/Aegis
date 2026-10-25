<script lang="ts">
  type Base = { id: string; label: string; hint?: string; required?: boolean };
  type Field = Base & ({ kind: 'text' | 'textarea'; value?: string } | { kind: 'number'; value?: number | null } | { kind: 'checkbox'; value?: boolean } | { kind: 'choice'; value?: string; options: string[] });
  let { data, onset }: { data: { description?: string; fields: Field[] }; onset: (path: (string | number)[], value: unknown) => void } = $props();
  const instance = $props.id();
  function save(index: number, value: unknown) { onset(['fields', index, 'value'], value); }
</script>
<form class="fields" onsubmit={e => e.preventDefault()}>
  {#if data.description}<p class="description">{data.description}</p>{/if}
  {#each data.fields as field, i}
    {@const hint = field.hint ? `${instance}-hint-${i}` : undefined}
    <div class="field">
      {#if field.kind === 'checkbox'}
        <label class="check"><input type="checkbox" checked={!!field.value} required={field.required} aria-describedby={hint} onchange={e => save(i, e.currentTarget.checked)} /><span>{field.label}{field.required ? ' (required)' : ''}</span></label>
      {:else if field.kind === 'choice'}
        <fieldset aria-describedby={hint}><legend>{field.label}{field.required ? ' (required)' : ''}</legend><div class="choices">{#each field.options as option}<label class="choice"><input type="radio" name={field.id} value={option} checked={field.value === option} required={field.required} onchange={() => save(i, option)} /><span>{option}</span></label>{/each}</div></fieldset>
      {:else if field.kind === 'textarea'}
        <label><span>{field.label}{field.required ? ' (required)' : ''}</span><textarea value={field.value ?? ''} required={field.required} aria-describedby={hint} maxlength="2000" onchange={e => save(i, e.currentTarget.value)}></textarea></label>
      {:else if field.kind === 'number'}
        <label><span>{field.label}{field.required ? ' (required)' : ''}</span><input type="number" step="any" value={field.value ?? ''} required={field.required} aria-describedby={hint} onchange={e => { if (e.currentTarget.value === '') save(i, null); else if (Number.isFinite(e.currentTarget.valueAsNumber)) save(i, e.currentTarget.valueAsNumber); }} /></label>
      {:else}
        <label><span>{field.label}{field.required ? ' (required)' : ''}</span><input type="text" value={field.value ?? ''} required={field.required} aria-describedby={hint} maxlength="2000" onchange={e => save(i, e.currentTarget.value)} /></label>
      {/if}
      {#if field.hint}<p class="hint" id={hint}>{field.hint}</p>{/if}
    </div>
  {/each}
  <p class="save-state">Changes save to this board when you leave a field.</p>
</form>
<style>
  .fields { display: grid; gap: 20px; }
  .description { color: var(--ink-2); font-size: 13px; }
  label > span, legend { display: block; font-size: 13px; margin-bottom: 8px; }
  .check { display: flex; align-items: center; gap: 10px; min-height: 32px; cursor: pointer; }
  .check span, .choice span { margin: 0; }
  .hint, .save-state { color: var(--muted); font-size: 12px; }
  .hint { margin-top: 6px; }
  fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
  .choices { display: flex; flex-wrap: wrap; gap: 8px 20px; }
  .choice { display: flex; gap: 8px; align-items: center; min-height: 32px; cursor: pointer; }
  @media (pointer: coarse) { .check, .choice { min-height: 44px; } }
</style>
