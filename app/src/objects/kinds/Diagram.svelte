<!-- Diagram object: boxes and arrows, laid out by the app (never by the model). Look modelled on Zephium's
     Diagram (MPL-2.0): hairline flows, quiet tiers, dashed flows that run against the direction. -->
<script lang="ts">
  import { layout, type Diagram } from './diagram';
  let { data }: { data: Diagram } = $props();
  const laid = $derived(layout(data));
  // Fit the whole diagram in its card: scale down (never up) to the width available.
  let box = $state(0);
  const scale = $derived(box ? Math.min(1, box / laid.width) : 1);
  let lit = $state<string | null>(null);
  const near = (id: string) => !lit || id === lit || data.edges.some(e => (e.from === lit && e.to === id) || (e.to === lit && e.from === id));
</script>

<div class="fit" bind:clientWidth={box} style:block-size={`${laid.height * scale}px`}>
<div class="diagram" style:inline-size={`${laid.width}px`} style:block-size={`${laid.height}px`} style:transform={scale < 1 ? `scale(${scale})` : undefined}>
  {#each laid.bands as band (band.name)}
    <div class="band" style:left={`${band.x}px`} style:top={`${band.y}px`} style:width={`${band.w}px`} style:height={`${band.h}px`}><span>{band.name}</span></div>
  {/each}
  <svg class="flows" width={laid.width} height={laid.height} aria-hidden="true">
    {#each laid.edges as r, i (i)}
      {@const on = lit && (r.edge.from === lit || r.edge.to === lit)}
      <g class="flow" class:back={r.back} class:lit={on} class:away={lit && !on}>
        <path d={r.d} /><path class="head" d={r.head} />
      </g>
    {/each}
  </svg>
  {#each laid.edges as r, i (i)}
    {#if r.label}<span class="edge-label" class:away={lit && r.edge.from !== lit && r.edge.to !== lit} style:left={`${r.label.x}px`} style:top={`${r.label.y}px`}>{r.edge.label}</span>{/if}
  {/each}
  {#each laid.nodes as p (p.node.id)}
    <div class="node {p.node.kind}" class:away={!near(p.node.id)} role="img" aria-label={p.node.name}
      style:left={`${p.x}px`} style:top={`${p.y}px`} style:width={`${p.w}px`} style:height={`${p.h}px`} style:--tone={`var(--chart-${p.colour + 1})`}
      onpointerenter={() => (lit = p.node.id)} onpointerleave={() => (lit = null)}>
      <strong>{p.node.name}</strong>
      {#if p.node.note}<span>{p.node.note}</span>{/if}
    </div>
  {/each}
</div>
</div>

<style>
  .fit { inline-size: 100%; overflow: hidden; }
  .diagram { position: relative; color: var(--color-text); transform-origin: 0 0; }
  .flows { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
  .flow path { fill: none; stroke: var(--color-border-strong); stroke-width: 1.25; transition: opacity var(--motion-fast) var(--ease-out); }
  .flow path.head { fill: var(--color-border-strong); stroke: none; }
  .flow.back path:not(.head) { stroke-dasharray: 3 3; }
  .flow.lit path { stroke: var(--color-muted); stroke-width: 1.5; }
  .flow.lit path.head { fill: var(--color-muted); }
  .flow.away { opacity: 0.18; }
  .node { position: absolute; box-sizing: border-box; display: flex; flex-direction: column; gap: 3px; padding: 10px 14px; border-radius: 6px;
    background: color-mix(in srgb, var(--tone) 5%, var(--color-surface)); border: 1px solid color-mix(in srgb, var(--tone) 18%, transparent);
    transition: opacity var(--motion-fast) var(--ease-out); overflow: hidden; }
  .node strong { font-size: var(--text-body); font-weight: 650; line-height: 18px; }
  .node span { color: var(--color-label-secondary); font-size: var(--text-label); line-height: 16px; }
  .node.external, .node.client { border-style: dashed; }
  .node.away, .edge-label.away { opacity: 0.35; }
  .edge-label { position: absolute; transform: translate(-50%, -50%); padding: 1px 6px; border-radius: var(--radius-capsule); background: var(--color-surface); color: var(--color-muted); font-size: var(--text-caption); white-space: nowrap; }
  .band { position: absolute; box-sizing: border-box; border-radius: 8px; background: var(--color-fill); }
  .band span { position: absolute; inset-block-start: 5px; inset-inline-start: 12px; color: var(--color-muted); font-size: var(--text-caption); font-weight: 500; }
</style>
