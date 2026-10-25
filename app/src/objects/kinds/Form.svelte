<script lang="ts">
  import Text from './Text.svelte';
  type Base = { id: string; label: string; hint?: string; required?: boolean };
  type Field = Base & ({ kind: 'text' | 'textarea'; value?: string } | { kind: 'number'; value?: number | null } | { kind: 'checkbox'; value?: boolean } | { kind: 'choice'; value?: string; options: string[] });
  let { data, onset }: { data: { description?: string; fields: Field[] }; onset: (path: (string | number)[], value: unknown) => void } = $props();
  const instance = $props.id();
  let committed = $state(false);
  function save(index: number, value: unknown) { committed = true; onset(['fields', index, 'value'], value); }
</script>
<form class="fields" onsubmit={e => e.preventDefault()}>
  {#if data.description}<p class="description"><Text value={data.description} label="Form description" path={['description']} multiline maxlength={400} /></p>{/if}
  {#each data.fields as field, i}
    {@const hint = [field.hint ? `${instance}-hint-${i}` : '', !committed && ['text', 'textarea', 'number'].includes(field.kind) ? `${instance}-commit-${i}` : ''].filter(Boolean).join(' ') || undefined}
    <div class="field" data-field-index={i}>
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
      {#if field.hint}<p class="hint" id={`${instance}-hint-${i}`}>{field.hint}</p>{/if}
      {#if ['text', 'textarea', 'number'].includes(field.kind)}<span class="commit-hint" id={`${instance}-commit-${i}`} class:visible={!committed} aria-hidden={committed}>Saves when you leave the field</span>{/if}
    </div>
  {/each}
  <p class="save-state">Changes save to this board when you leave a field.</p>
</form>
<style>
  .fields { display: grid; gap: 20px; }
  .field { position: relative; }
  .commit-hint { position: absolute; right: 0; bottom: -18px; display: block; color: var(--muted); font-size: 12px; opacity: 0; transition: opacity 200ms var(--ease-out); pointer-events: none; }
  .field:focus-within .commit-hint.visible { opacity: 1; }
  @media (min-width: 1100px) { .commit-hint { top: 0; bottom: auto; } }
  @media (prefers-reduced-motion: reduce) { .commit-hint { transition: none; } }
  :global(body.motion-off) .commit-hint { transition: none; }
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
