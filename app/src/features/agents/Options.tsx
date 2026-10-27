import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';
import { agentName, shortTitle } from './results.js';
import { modelValue, providerName } from './model-choice.js';
import type { AgentRuntime } from './runtime.js';
import type { AgentId } from '@aegis/domain/schema';

type Page = 'options' | 'model' | 'status' | 'count';
export function Options({ runtime, show, addNotes, showAll, changed }: {
  readonly runtime: AgentRuntime; readonly show: (id: AgentId) => void;
  readonly addNotes: () => void; readonly showAll: () => void; readonly changed: () => void;
}) {
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const [page, setPage] = useState<Page>('options');
  const [opened, setOpened] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const close = (focus = true): void => { setOpened(false); menu.current?.hidePopover(); if (focus) trigger.current?.focus({ preventScroll: true }); };
  useMenuPosition(trigger, menu, opened);
  useLayoutEffect(() => {
    if (!opened) return;
    const target = menu.current?.querySelector('[aria-checked="true"]') ?? menu.current?.querySelector('button');
    if (target instanceof HTMLElement) { target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'nearest' }); }
  }, [opened, page]);
  const modelLabel = state.models.find(model => state.model && modelValue(model) === modelValue(state.model))?.name ?? 'Choose a model';
  const statusLabel = state.models.find(model => state.statusModel && modelValue(model) === modelValue(state.statusModel))?.name ?? 'Choose a model';
  function view(next: Page): void { setPage(next); }
  const label = page === 'model' ? 'Agent model' : page === 'status' ? 'Status model' : page === 'count' ? 'Agent count' : 'Agent options';
  return <>
    <button ref={trigger} id="orbMenuButton" type="button" className="island-icon" aria-label="Agent options" aria-haspopup="menu" aria-expanded={opened} aria-controls="orbMenu"
      onClick={() => { if (opened) close(); else { setPage('options'); setOpened(true); menu.current?.showPopover(); } }}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10M3 8h10M3 12h10" /><circle cx="6" cy="4" r="1.5" /><circle cx="10" cy="8" r="1.5" /><circle cx="6" cy="12" r="1.5" /></svg>
    </button>
    <div ref={menu} id="orbMenu" popover="auto" className="orb-menu aegis-dropdown-menu aegis-surface" role="menu" aria-label={label}
      onToggle={event => setOpened(event.newState === 'open')}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); close(); return; }
        const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const index = items.findIndex(item => item === document.activeElement);
        let next: HTMLButtonElement | undefined;
        if (event.key === 'ArrowDown') next = items[(index + 1) % items.length];
        else if (event.key === 'ArrowUp') next = items[(index - 1 + items.length) % items.length];
        else if (event.key === 'Home') next = items[0];
        else if (event.key === 'End') next = items.at(-1);
        else if (event.key.length === 1 && event.key !== ' ') next = [...items.slice(index + 1), ...items.slice(0, index + 1)].find(item => item.textContent?.trim().toLowerCase().startsWith(event.key.toLowerCase()));
        if (next) { event.preventDefault(); next.focus(); next.scrollIntoView({ block: 'nearest' }); }
        if (event.key === 'Tab') close(false);
      }}>
      {page !== 'options' ? <button type="button" role="menuitem" onClick={() => view('options')}>Back to agent options</button> : null}
      {page === 'options' ? <>
        <button type="button" role="menuitem" aria-haspopup="menu" onClick={() => view('model')}><span>Agent model</span><span className="orb-menu-value">{modelLabel}</span></button>
        <button type="button" role="menuitem" aria-haspopup="menu" onClick={() => view('count')}><span>Agent count</span><span className="orb-menu-value">{state.count === 1 ? 'One' : state.count}</span></button>
        <button type="button" role="menuitem" aria-haspopup="menu" onClick={() => view('status')}><span>Status model</span><span className="orb-menu-value">{statusLabel}</span></button>
        <hr />
        <button type="button" role="menuitem" onClick={() => { close(false); addNotes(); }}>Add as notes<span className="orb-menu-value">⌘Return / Ctrl+Return</span></button>
        <button type="button" role="menuitem" onClick={() => { close(false); runtime.newAgent(); changed(); }}>New agent</button>
        <button type="button" role="menuitem" onClick={() => { close(); showAll(); }}>All agents</button>
        {state.agents.map(agent => <button type="button" key={agent.id} role="menuitemradio" aria-checked={runtime.current()?.id === agent.id}
          aria-description={agentName(agent, state.agents)} onClick={() => { close(false); show(agent.id); }}><span>{shortTitle(agent)}</span><span className="orb-menu-value">{agent.running ? 'Working' : 'Ready'}</span></button>)}
      </> : page === 'count' ? [1, 2, 3, 4, 5, 6, 7, 8].map(count => <button type="button" role="menuitemradio" aria-label={`${count} agent${count === 1 ? '' : 's'}`} aria-checked={state.count === count} key={count} onClick={() => { runtime.count(count); close(); }}>{count === 1 ? 'One' : `${count} agents`}</button>) :
        [...new Set(state.models.map(model => model.provider))].map(provider => {
          const description = state.readyProviders.has(provider) ? provider === 'fake' ? 'Available' : 'Signed in' : 'Sign in required';
          return <div key={provider} role="group" aria-label={`${providerName(provider)}, ${description}`}>
            <div className="aegis-model-group" aria-hidden="true"><span>{providerName(provider)}</span><span>{description}</span></div>
            {state.models.filter(model => model.provider === provider).map(model => {
              const current = page === 'model' ? state.model : state.statusModel;
              return <button type="button" role="menuitemradio" key={modelValue(model)} aria-description={description} aria-checked={!!current && modelValue(model) === modelValue(current)}
                onClick={() => { if (page === 'model') { runtime.model(modelValue(model)); changed(); } else runtime.statusModel(modelValue(model)); close(); }}>{model.name}</button>;
            })}
          </div>;
        })}
    </div>
  </>;
}

function useMenuPosition(trigger: RefObject<HTMLButtonElement | null>, menu: RefObject<HTMLDivElement | null>, opened: boolean): void {
  useEffect(() => {
    if (!opened) return;
    function position(): void {
      const anchor = trigger.current, node = menu.current;
      if (!anchor || !node) return;
      const box = anchor.getBoundingClientRect();
      const height = Math.min(node.scrollHeight, innerHeight * .55, 480);
      node.style.left = `${Math.max(10, Math.min(innerWidth - Math.min(340, innerWidth - 24) - 10, box.left))}px`;
      node.style.top = `${Math.max(10, Math.min(innerHeight - height - 10, box.top - height - 8))}px`;
    }
    position();
    const observer = new ResizeObserver(position);
    if (menu.current) observer.observe(menu.current);
    addEventListener('resize', position);
    return () => { observer.disconnect(); removeEventListener('resize', position); };
  }, [trigger, menu, opened]);
}
