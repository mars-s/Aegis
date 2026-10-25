<script lang="ts">
  import Text from './Text.svelte';
  type Event = { date: string; title: string; detail?: string; done?: boolean };
  let { data, onset }: { data: { events: Event[]; direction?: string; checkable?: boolean }; onset: (path: (string | number)[], value: unknown) => void } = $props();
</script>
<ol class="timeline" class:horizontal={data.direction === 'horizontal'}>
  {#each data.events as event, i}
    <li class:done={event.done}>
      <div class="date"><time datetime={event.date}><Text value={event.date} label={`Event ${i + 1} date`} path={['events', i, 'date']} maxlength={10} /></time></div>
      <div class="station">
        {#if data.checkable}<label class="tick"><input type="checkbox" checked={!!event.done} aria-label={`Done: ${event.title}`} onchange={e => onset(['events', i, 'done'], e.currentTarget.checked)} /></label>{:else}<i></i>{/if}
      </div>
      <div class="event"><strong><Text value={event.title} label={`Event ${i + 1} title`} path={['events', i, 'title']} maxlength={100} /></strong>{#if event.detail}<p><Text value={event.detail} label={`Event ${i + 1} detail`} path={['events', i, 'detail']} multiline maxlength={400} /></p>{/if}</div>
    </li>
  {/each}
</ol>
<style>
  .timeline { list-style: none; padding: 0; margin: 0; }
  li { display: grid; grid-template-columns: 86px 32px minmax(0, 1fr); gap: 8px; }
  .date { font-size: 12px; color: var(--muted); padding-top: 3px; }
  .station { display: flex; justify-content: center; position: relative; }
  .station::before { content: ''; position: absolute; width: 1px; background: var(--line-strong); top: 10px; bottom: -10px; }
  li:last-child .station::before { display: none; }
  i { display: block; position: relative; width: 8px; height: 8px; margin-top: 7px; border: 1px solid var(--data); border-radius: 50%; background: var(--card); }
  .tick { position: relative; display: grid; place-items: start center; min-width: 32px; padding-top: 2px; cursor: pointer; }
  .event { padding-bottom: 24px; overflow-wrap: anywhere; }
  strong { font-size: 14px; font-weight: 500; }
  .event p { margin-top: 4px; color: var(--muted); font-size: 13px; }
  .done strong { color: var(--muted); text-decoration: line-through; }
  .horizontal { display: flex; overflow-x: auto; }
  .horizontal li { flex: 1 0 160px; display: flex; flex-direction: column; gap: 10px; }
  .horizontal .station { justify-content: start; min-height: 22px; }
  .horizontal .station::before { height: 1px; width: 100%; top: 10px; bottom: auto; left: 5px; }
  .horizontal .event { padding-right: 20px; }
  @container (max-width: 360px) { li { grid-template-columns: 78px 24px minmax(0, 1fr); gap: 4px; } }
  @media (pointer: coarse) { .tick { min-width: 44px; min-height: 44px; } }
</style>
