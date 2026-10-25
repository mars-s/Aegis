<script lang="ts">
  type Status = 'pending' | 'active' | 'done' | 'blocked';
  let { data, onset }: { data: { steps: { title: string; detail?: string; status: Status }[]; editable?: boolean }; onset: (path: (string | number)[], value: unknown) => void } = $props();
  const names: Record<Status, string> = { pending: 'Pending', active: 'In progress', done: 'Done', blocked: 'Blocked' };
  const statuses: Status[] = ['pending', 'active', 'done', 'blocked'];
</script>
<ol class="stages">
  {#each data.steps as step, i}
    <li class={step.status}>
      <div class="rail"><span class="dot">{i + 1}</span></div>
      <strong>{step.title}</strong><span class="status">{names[step.status]}</span>
      {#if step.detail}<p>{step.detail}</p>{/if}
      {#if data.editable}<details><summary>Set status<span class="sr-only"> for {step.title}</span></summary><div class="statuses">{#each statuses as status}<button type="button" aria-pressed={status === step.status} aria-label={`${step.title}: ${names[status]}`} onclick={() => onset(['steps', i, 'status'], status)}>{names[status]}</button>{/each}</div></details>{/if}
    </li>
  {/each}
</ol>
<style>
  .stages { display: flex; gap: 0; padding: 0; margin: 0; list-style: none; overflow-x: auto; }
  li { flex: 1 0 160px; padding-right: 20px; min-width: 0; overflow-wrap: anywhere; }
  .rail { position: relative; margin-bottom: 12px; }
  .rail::before { content: ''; position: absolute; top: 13px; left: 26px; width: calc(100% - 6px); height: 1px; background: var(--line-strong); }
  li:last-child .rail::before { display: none; }
  .dot { position: relative; display: grid; place-items: center; width: 26px; height: 26px; font-size: 12px; border: 1px solid var(--line-strong); border-radius: 50%; background: var(--card); color: var(--muted); }
  .active .dot, .done .dot { color: var(--data); border-color: var(--data); }
  .blocked .dot { border-style: dashed; color: var(--text); }
  strong { display: block; font-size: 14px; font-weight: 500; }
  .status { display: block; color: var(--muted); font-size: 12px; margin-top: 4px; }
  li p { margin-top: 12px; color: var(--ink-2); font-size: 13px; }
  summary { min-height: 32px; display: flex; align-items: center; margin-top: 8px; text-decoration: underline; text-underline-offset: 3px; }
  .statuses { display: flex; flex-wrap: wrap; gap: 6px; padding-top: 4px; }
  .statuses button[aria-pressed=true] { border-color: var(--text); color: var(--text); }
  .sr-only { position: absolute; width: 1px; height: 1px; clip-path: inset(50%); overflow: hidden; }
</style>
