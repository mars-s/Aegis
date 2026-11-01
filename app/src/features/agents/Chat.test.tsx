import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WELCOME_BRIEF } from '@aegis/domain/profile';
import { AgentSnapshotSchema } from './schema.js';
import { Conversation } from './Chat.js';

const greeting = 'Who are you, and what would help your workflow?';
function render(brief: string, turns: readonly { id: string; role: 'user' | 'assistant'; text: string }[] = [], partial = ''): string {
  const agent = AgentSnapshotSchema.parse({ id: 'introduction', boardId: 'board', brief, model: { provider: 'fake', modelId: 'fake' }, created: 1, status: 'Ready', running: false, parent: null, title: null, text: greeting, partial, turns, error: null });
  return renderToStaticMarkup(createElement(Conversation, { agent, className: 'island-turns' }));
}

afterEach(() => vi.unstubAllGlobals());
describe('introduction conversation presentation', () => {
  it('opens with the AI greeting while preserving real follow-up turns', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'introduction' });
    const html = render('Avi replies', [
      { id: 'first', role: 'user', text: 'Introduction' },
      { id: 'hello', role: 'assistant', text: greeting },
      { id: 'real', role: 'user', text: 'Introduction' },
    ]);
    expect(html.indexOf('island-turn assistant')).toBeLessThan(html.indexOf('island-turn user'));
    expect(html.match(/Introduction/g)).toHaveLength(1);
    expect(html).toContain(greeting);
  });
  it('hides the synthetic fallback before turns arrive, including a streaming greeting', () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    const html = render(WELCOME_BRIEF, [], 'Hello Avi');
    expect(html).not.toContain(WELCOME_BRIEF);
    expect(html).not.toContain('island-turn user');
    expect(html).toContain('Hello Avi');
  });
  it('retains an ordinary user request reading Introduction', () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    const html = render('Introduction', [{ id: 'real', role: 'user', text: 'Introduction' }]);
    expect(html).toContain('Introduction');
    expect(html).toContain('island-turn user');
  });
});
