<script lang="ts">
  import { onMount } from 'svelte';
  import { start } from './controller';
  onMount(() => { void start(); });
</script>

<header class="bar" data-tauri-drag-region>
  <div class="bar-left" data-tauri-drag-region>
    <button class="icon-btn" id="sideBtn" title="Side bar (\)" aria-pressed="true"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M6 3v10" stroke="currentColor" stroke-width="1.3"/></svg></button>
    <nav class="board-crumbs" id="boardCrumbs" aria-label="Board breadcrumbs"></nav>
    <span class="board-name" id="boardName" data-tauri-drag-region>Untitled</span>
    <span class="save-state" id="saveState" role="status" aria-live="polite">saved</span>
    <button id="retrySave" hidden>Retry</button>
  </div>
  <div class="bar-right">
    <span class="status" id="status" aria-live="polite"></span>
    <button class="chip" id="showChip" hidden>Show</button>
    <button class="follow" id="followBtn" role="switch" aria-checked="true" title="Follow agents (Shift+F): the camera glides to what agents make"><span class="knob"></span>Follow</button>
    <button class="icon-btn" id="agentsBtn" title="Agents (A)" aria-pressed="false"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="6" r="2.2" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="11" cy="6" r="2.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M1.5 13c.6-2 2-3 3.5-3s2.9 1 3.5 3M7.5 13c.6-2 2-3 3.5-3s2.9 1 3.5 3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg><span class="count" id="agentCount" hidden></span></button>
    <button class="icon-btn" id="settingsBtn" title="Settings"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></button>
  </div>
</header>

<aside class="side" id="side" aria-label="Side bar">
  <section class="pbox" data-panel="library">
    <div class="phead"><span>Library</span><button class="fold" aria-label="Fold Library"><svg viewBox="0 0 10 10"><path d="M2 5h6"/><path class="v" d="M5 2v6"/></svg></button></div>
    <div class="pbody">
      <div class="tree" role="tree"></div>
      <div class="adds"><button data-add="board">+ Board</button><button data-add="folder">+ Folder</button><button data-add="project">+ Project</button></div>
    </div>
    <div class="resize-handle" title="Drag to resize"></div>
  </section>
  <section class="pbox" data-panel="layers">
    <div class="phead"><span>Layers <span class="pcount" id="layerCount"></span></span><button class="fold" aria-label="Fold Layers"><svg viewBox="0 0 10 10"><path d="M2 5h6"/><path class="v" d="M5 2v6"/></svg></button></div>
    <div class="pbody"><div class="layer-list"></div></div>
    <div class="resize-handle" title="Drag to resize"></div>
  </section>
  <section class="pbox" data-panel="keys">
    <div class="phead"><span>Shortcuts</span><button class="fold" aria-label="Fold Shortcuts"><svg viewBox="0 0 10 10"><path d="M2 5h6"/><path class="v" d="M5 2v6"/></svg></button></div>
    <div class="pbody keys">
      <div><kbd>V</kbd><kbd>N</kbd><kbd>H</kbd><kbd>C</kbd><kbd>R</kbd><kbd>L</kbd><kbd>M</kbd><span>tools</span></div>
      <div><kbd>dbl-click</kbd><span>new note</span></div>
      <div><kbd>space</kbd><span>+ drag to pan</span></div>
      <div><kbd>⌘</kbd><kbd>scroll</kbd><span>zoom</span></div>
      <div><kbd>0</kbd><span>fit board</span></div>
      <div><kbd>⌘[</kbd><kbd>⌘]</kbd><span>send backward, bring forward</span></div>
      <div><kbd>F</kbd><span>focus selection</span></div>
      <div><kbd>Shift+F</kbd><span>follow agents</span></div>
      <div><kbd>A</kbd><span>agents</span></div>
      <div><kbd>/</kbd><span>composer</span></div>
      <div><kbd>\</kbd><span>side bar</span></div>
      <div><kbd>⌫</kbd><span>delete</span></div>
    </div>
    <div class="resize-handle" title="Drag to resize"></div>
  </section>
  <div class="side-resize" title="Drag to resize"></div>
</aside>

<nav class="tools" id="tools" aria-label="Tools">
  <button data-tool="select" title="Select (V)" aria-pressed="true"><svg viewBox="0 0 16 16"><path d="M4 2.5 12 8l-3.6.7L10.6 13l-1.5.7-2.2-4.3L4 12z"/></svg></button>
  <button data-tool="note" title="Note (N)"><svg viewBox="0 0 16 16"><path d="M3.5 2.5h6l3 3v8h-9z"/><path d="M9.5 2.5v3h3"/></svg></button>
  <button data-tool="title" title="Heading (H)"><svg viewBox="0 0 16 16"><path d="M3.5 4V3h9v1M8 3v10M6 13h4"/></svg></button>
  <button data-tool="todo" title="Checklist (C)"><svg viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="10" rx="2"/><path d="m5.5 8 1.8 1.8L10.5 6"/></svg></button>
  <button data-tool="readme" title="Read-me note (R)"><svg viewBox="0 0 16 16"><path d="M3 3.5h4a1.5 1.5 0 0 1 1 .5 1.5 1.5 0 0 1 1-.5h4V12H9a1.5 1.5 0 0 0-1 .5 1.5 1.5 0 0 0-1-.5H3z"/><path d="M8 4v8.5"/></svg></button>
  <button data-tool="link" title="Link (L)"><svg viewBox="0 0 16 16"><path d="M7 9a2.5 2.5 0 0 0 3.5 0l2-2A2.5 2.5 0 0 0 9 3.5l-.8.8M9 7a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7 12.5l.8-.8"/></svg></button>
  <button data-tool="media" title="Image or video (M)"><svg viewBox="0 0 16 16"><rect x="2.5" y="3" width="11" height="10" rx="2"/><circle cx="6" cy="6.5" r="1.2"/><path d="m3 12 3.5-3.5 2.5 2.5 1.5-1.5 2.5 2.5"/></svg></button>
  <span class="tools-sep"></span>
  <button class="tools-fold" id="toolsFold" title="Fold tools" aria-expanded="true"><svg viewBox="0 0 16 16"><path d="M5 10l3-3 3 3"/></svg></button>
</nav>
<input type="file" id="mediaFile" accept="image/*,video/*" multiple hidden>

<main class="stage" id="stage" tabindex="0" aria-label="Canvas">
  <canvas class="grid" id="grid" aria-hidden="true"></canvas>
  <svg class="links" id="links" aria-hidden="true"></svg>
  <div class="world" id="world"></div>
  <div class="marquee" id="marquee" hidden></div>
  <div class="empty" id="empty" hidden>
    <p class="empty-title">Dump everything here.</p>
    <p class="empty-sub">Double-click to write, drop images or video, or type below and an agent sorts it.</p>
  </div>
</main>

<aside class="panel" id="agentsPanel" hidden aria-label="Agents">
  <div class="panel-head"><span>Agents</span><button class="text-btn" id="closeAgents">Close</button></div>
  <div class="agent-list" id="agentList"></div>
</aside>

<form class="composer" id="composer" autocomplete="off">
  <textarea id="prompt" rows="1" placeholder="Brain dump, or ask an agent to sort the board…" aria-label="Message"></textarea>
  <div class="composer-row">
    <select id="model" aria-label="Model"></select>
    <label class="spawn" title="Agents to start"><span>×</span><input id="count" type="number" min="1" max="8" value="1" aria-label="Number of agents"></label>
    <span class="spacer"></span>
    <button type="button" class="text-btn" id="dumpBtn" title="Add as notes without an agent (⌘⏎)">Add notes</button>
    <button type="submit" class="send" id="send" aria-label="Start agent"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 12V2M2.5 6.5 7 2l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
  </div>
</form>

<dialog class="sheet" id="settings">
  <div class="sheet-head"><h2>Settings</h2><button class="text-btn" id="closeSettings">Done</button></div>
  <section class="sheet-sec" data-settings="accounts">
    <h3>Accounts</h3>
    <p class="muted">Agents use your own ChatGPT or Claude subscription. Tokens stay on this Mac.</p>
    <div class="account" data-provider="openai">
      <div class="acct-row"><div class="acct-name"><strong>ChatGPT</strong><span class="acct-state"></span></div><button class="pill acct-btn"></button></div>
      <div class="acct-flow" hidden>
        <p class="acct-help"></p>
        <div class="row"><button type="button" class="text-btn acct-open">Open sign-in page again</button><button type="button" class="text-btn acct-copy">Copy link</button></div>
        <form class="row acct-paste"><input autocomplete="off" spellcheck="false"><button class="pill" type="submit">Continue</button></form>
      </div>
    </div>
    <div class="account" data-provider="anthropic">
      <div class="acct-row"><div class="acct-name"><strong>Claude</strong><span class="acct-state"></span></div><button class="pill acct-btn"></button></div>
      <div class="acct-flow" hidden>
        <p class="acct-help"></p>
        <div class="row"><button type="button" class="text-btn acct-open">Open sign-in page again</button><button type="button" class="text-btn acct-copy">Copy link</button></div>
        <form class="row acct-paste"><input autocomplete="off" spellcheck="false"><button class="pill" type="submit">Continue</button></form>
      </div>
    </div>
  </section>
  <section class="sheet-sec" data-settings="appearance">
    <h3>Theme</h3>
    <div class="seg" role="radiogroup" id="theme"><button data-v="system" role="radio">System</button><button data-v="light" role="radio">Light</button><button data-v="dark" role="radio">Dark</button></div>
  </section>
  <section class="sheet-sec muted small">Agents run with your user's file permissions on this Mac.</section>
</dialog>

<div class="toast" id="toast" role="status" hidden></div>
