<script lang="ts">
  import Text from './Text.svelte';
  import Actions from './Actions.svelte';
  type Status = 'pending' | 'active' | 'done' | 'blocked';
  let { data, onset }: { data: { steps: { title: string; detail?: string; status: Status }[]; editable?: boolean }; onset: (path: (string | number)[], value: unknown) => void } = $props();
  const names: Record<Status, string> = { pending: 'Pending', active: 'In progress', done: 'Done', blocked: 'Blocked' };
  const statuses: Status[] = ['pending', 'active', 'done', 'blocked'];
</script>
<ol class="stages">
  {#each data.steps as step, i}
    <li class={step.status}>
      <div class="rail"><span class="dot">{i + 1}</span></div>
      <strong><Text value={step.title} label={`Stage ${i + 1} title`} path={['steps', i, 'title']} maxlength={80} /></strong><span class="status">{names[step.status]}</span>
      {#if step.detail}<p><Text value={step.detail} label={`Stage ${i + 1} detail`} path={['steps', i, 'detail']} multiline maxlength={240} /></p>{/if}
      {#if data.editable}<Actions label={`Set status for ${step.title}`} heading={step.title} items={() => statuses.map(status => ({ title: names[status], ariaLabel: `${step.title}: ${names[status]}`, checked: status === step.status, run: () => onset(['steps', i, 'status'], status) }))} />{/if}
    </li>
  {/each}
</ol>
<style>
  .stages { display: flex; gap: 0; padding: 0; margin: 0; list-style: none; overflow-x: auto; }
  li { position: relative; flex: 1 0 160px; padding-right: 20px; min-width: 0; overflow-wrap: anywhere; }
  .rail { position: relative; margin-bottom: 12px; }
  .rail::before { content: ''; position: absolute; top: 13px; left: 26px; width: calc(100% - 6px); height: 1px; background: var(--line-strong); }
  li:last-child .rail::before { display: none; }
  .dot { position: relative; display: grid; place-items: center; width: 26px; height: 26px; font-size: 12px; border: 1px solid var(--line-strong); border-radius: 50%; background: var(--card); color: var(--muted); }
  .active .dot, .done .dot { color: var(--data); border-color: var(--data); }
  .blocked .dot { border-style: dashed; color: var(--text); }
  strong { display: block; font-size: 14px; font-weight: 500; }
  .status { display: block; color: var(--muted); font-size: 12px; margin-top: 4px; }
  li p { margin-top: 12px; color: var(--ink-2); font-size: 13px; }
</style>
