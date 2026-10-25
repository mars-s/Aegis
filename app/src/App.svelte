<script lang="ts">
  import { onMount } from 'svelte';
  import { start } from './controller';
  import { SHORTCUTS, SHORTCUT_LIST, TOOL_SHORTCUTS, shortcutText, shortcutTitle } from './lib/shortcuts.js';
  // PM 6: secondary chrome reveals only when reached or in use.
  import { mountIdleChrome } from './chrome/idle.js';
  onMount(() => { const dispose = mountIdleChrome(); void start(); return dispose; });
</script>

<header class="bar" data-tauri-drag-region>
  <button class="board-name" id="boardName" aria-controls="side" aria-expanded="false" title="Windows and library">Untitled</button>
  <div class="bar-right">
    <button class="icon-btn" id="sideBtn" title={shortcutTitle("sidebar")} aria-pressed="false" aria-label="Toggle windows and library"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M6 3v10" stroke="currentColor" stroke-width="1.3"/></svg></button>
    <span class="save-state" id="saveState" role="status" aria-live="polite">saved</span>
    <button id="retrySave" hidden>Retry</button>
    <span class="status" id="status" aria-live="polite"></span>
    <button class="chip" id="showChip" hidden>Show</button>
    <button class="follow" id="followBtn" role="switch" aria-checked="true" title={`${shortcutTitle("follow")}: the camera glides to what agents make`}><span class="knob"></span>Follow</button>
    <button class="icon-btn" id="agentsBtn" title={shortcutTitle("agents")} aria-pressed="false"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="6" r="2.2" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="11" cy="6" r="2.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M1.5 13c.6-2 2-3 3.5-3s2.9 1 3.5 3M7.5 13c.6-2 2-3 3.5-3s2.9 1 3.5 3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg><span class="count" id="agentCount" hidden></span></button>
    <button class="icon-btn" id="settingsBtn" title="Settings"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></button>
  </div>
</header>

<button class="edge-arrow edge-arrow-left" id="revealLeft" type="button" aria-controls="side" aria-expanded="false" aria-label="Show windows and library" title={shortcutTitle("leftSidebar")}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5"/></svg></button>
<button class="edge-arrow edge-arrow-right" id="revealRight" type="button" aria-controls="sideRight" aria-expanded="false" aria-label="Show agent activity and panels" title={shortcutTitle("rightSidebar")}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10 3.5-4.5 4.5 4.5 4.5"/></svg></button>
<aside class="side" id="side" aria-label="Windows and library" hidden inert>
  <div class="side-head"><span>Windows and library</span><button class="icon-btn" id="closeSide" aria-label="Hide windows and library">×</button></div>
  <nav class="board-crumbs" id="boardCrumbs" aria-label="Board breadcrumbs"></nav>
  <!-- Round 3 navigation: current windows take the first, flexible section. -->
  <section class="pbox" data-panel="layers">
    <div class="phead"><span>Windows <span class="pcount" id="layerCount"></span></span><button class="fold" aria-label="Fold Windows"><svg viewBox="0 0 10 10"><path d="M2 5h6"/><path class="v" d="M5 2v6"/></svg></button></div>
    <div class="pbody"><div class="layer-list"></div></div>
    <div class="resize-handle" title="Drag to resize"></div>
  </section>
  <section class="pbox" data-panel="library">
    <div class="phead"><span>Library</span><button class="fold" aria-label="Fold Library"><svg viewBox="0 0 10 10"><path d="M2 5h6"/><path class="v" d="M5 2v6"/></svg></button></div>
    <div class="pbody">
      <div class="tree" role="tree"></div>
      <div class="adds"><button data-add="board">+ Board</button><button data-add="folder">+ Folder</button><button data-add="project">+ Project</button></div>
    </div>
    <div class="resize-handle" title="Drag to resize"></div>
  </section>
  <section class="pbox" data-panel="keys">
    <div class="phead"><span>Shortcuts</span><button class="fold" aria-label="Fold Shortcuts"><svg viewBox="0 0 10 10"><path d="M2 5h6"/><path class="v" d="M5 2v6"/></svg></button></div>
    <div class="pbody keys">
      <!-- PM 6: the tools shortcut stays discoverable in the shared reference. -->
      <div><kbd>⇧T / Shift+T</kbd><span>Show tools</span></div>
      <div>{#each TOOL_SHORTCUTS as id}<kbd data-shortcut={id}>{shortcutText(id)}</kbd>{/each}<span>Tools</span></div>
      {#each SHORTCUT_LIST as id}
        <div><kbd data-shortcut={id}>{shortcutText(id)}</kbd><span>{SHORTCUTS[id].label}</span></div>
      {/each}
    </div>
    <div class="resize-handle" title="Drag to resize"></div>
  </section>
  <div class="side-resize" title="Drag to resize"></div>
</aside>

<nav class="tools compact" id="tools" aria-label="Tools" aria-keyshortcuts="Shift+T">
  <button data-core="true" data-tool="select" title={shortcutTitle("select")}  aria-pressed="true"><svg viewBox="0 0 16 16"><path d="M4 2.5 12 8l-3.6.7L10.6 13l-1.5.7-2.2-4.3L4 12z"/></svg></button>
  <button data-core="true" data-tool="note" title={shortcutTitle("note")}><svg viewBox="0 0 16 16"><path d="M3.5 2.5h6l3 3v8h-9z"/><path d="M9.5 2.5v3h3"/></svg></button>
  <button data-core="true" data-tool="title" title={shortcutTitle("title")}><svg viewBox="0 0 16 16"><path d="M3.5 4V3h9v1M8 3v10M6 13h4"/></svg></button>
  <button data-core="true" data-tool="todo" title={shortcutTitle("todo")}><svg viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="10" rx="2"/><path d="m5.5 8 1.8 1.8L10.5 6"/></svg></button>
  <button data-tool="readme" title={shortcutTitle("readme")}><svg viewBox="0 0 16 16"><path d="M3 3.5h4a1.5 1.5 0 0 1 1 .5 1.5 1.5 0 0 1 1-.5h4V12H9a1.5 1.5 0 0 0-1 .5 1.5 1.5 0 0 0-1-.5H3z"/><path d="M8 4v8.5"/></svg></button>
  <button data-tool="link" title={shortcutTitle("link")}><svg viewBox="0 0 16 16"><path d="M7 9a2.5 2.5 0 0 0 3.5 0l2-2A2.5 2.5 0 0 0 9 3.5l-.8.8M9 7a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7 12.5l.8-.8"/></svg></button>
  <button data-core="true" data-tool="media" title={shortcutTitle("media")}><svg viewBox="0 0 16 16"><rect x="2.5" y="3" width="11" height="10" rx="2"/><circle cx="6" cy="6.5" r="1.2"/><path d="m3 12 3.5-3.5 2.5 2.5 1.5-1.5 2.5 2.5"/></svg></button>
  <button class="tools-fold" id="toolsFold" type="button" title="More tools (Shift+T)" aria-label="More tools" aria-controls="toolsPopover" aria-expanded="false"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r=".75"/><circle cx="8" cy="8" r=".75"/><circle cx="13" cy="8" r=".75"/></svg></button>
  <div class="tools-popover" id="toolsPopover" role="region" aria-label="More tools" hidden></div>
</nav>
<input type="file" id="mediaFile" accept="image/*,video/*" multiple hidden>

<main class="stage" id="stage" tabindex="0" aria-label="Canvas">
  <canvas class="grid" id="grid" aria-hidden="true"></canvas>
  <svg class="links" id="links" aria-hidden="true"></svg>
  <div class="world" id="world"></div>
  <div class="marquee" id="marquee" hidden></div>
  <div class="empty" id="empty" hidden>
    <p class="empty-sub">Drop files, or ask for something.</p>
  </div>
</main>

<aside class="panel" id="agentsPanel" hidden aria-label="All agents">
  <div class="panel-head"><span>All agents</span><button class="text-btn" id="closeAgents">Close</button></div>
  <div class="agent-list" id="agentList"></div>
</aside>

<div class="run-strip" id="runStrip" role="status" hidden><p class="run-title" id="runBrief"></p><div class="run-track"><span class="run-fill" id="runFill"></span><i></i><span id="runStep"></span></div></div>
<div class="agent-island" id="agentIsland" data-state="idle">
<div class="island-morph">
<div class="island-surface" aria-hidden="true"></div>
<div class="island-content">
<button class="ask-orb" id="askPill" type="button" aria-controls="composer" aria-expanded="false" aria-label={`Ask the agent. Shortcut ${shortcutText("ask", "text")} or ${shortcutText("askSlash")}.`}><span class="orb-mark" aria-hidden="true"><span class="orb-colours"></span><span class="orb-light"></span></span><span class="orb-invite">Ask…</span><span class="orb-status" id="orbStatus" role="status"></span><span class="orb-key" data-shortcut="ask" data-shortcut-format="mac">{shortcutText("ask", "mac")}</span></button>
<form class="composer agent-composer" id="composer" autocomplete="off" inert>
  <header class="island-head" hidden>
    <span class="orb-mark" aria-hidden="true"><span class="orb-colours"></span><span class="orb-light"></span></span>
    <p class="orb-activity" role="status"></p>
    <button type="button" class="text-btn island-stop" hidden>Stop</button>
    <button type="button" class="island-icon island-collapse" aria-label="Collapse conversation"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></button>
  </header>
  <div class="island-turns" role="log" aria-label="Agent conversation" tabindex="0" hidden></div>
  <textarea id="prompt" rows="1" placeholder="Brain dump, or ask an agent to sort the board…" aria-label="Message"></textarea>
  <div class="composer-row">
    <button type="button" class="island-icon" id="orbMenuButton" aria-label="Agent options" aria-haspopup="menu" aria-controls="orbMenu" aria-expanded="false"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10M3 8h10M3 12h10"/><circle cx="6" cy="4" r="1.5"/><circle cx="10" cy="8" r="1.5"/><circle cx="6" cy="12" r="1.5"/></svg></button>
    <span class="island-hint">Return to send <span>· Shift Return for a new line</span></span>
    <span class="spacer"></span>
    <button type="submit" class="send" id="send" aria-label="Start agent"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 12V2M2.5 6.5 7 2l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
  </div>
</form>
</div>
</div>
<div class="orb-menu" id="orbMenu" role="menu" aria-label="Agent options" hidden></div>
<div hidden>
  <select id="model" aria-label="Model"></select>
  <select id="count" aria-label="Number of agents">{#each [1, 2, 3, 4, 5, 6, 7, 8] as count}<option value={count}>{count === 1 ? '1 agent' : `${count} agents`}</option>{/each}</select>
</div>
</div>

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
