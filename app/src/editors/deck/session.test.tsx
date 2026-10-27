import { afterEach, describe, expect, it } from 'vitest';
import { applyBatch, BoardIdSchema, CardIdSchema, emptyBoard, JsonRecordSchema } from '@aegis/domain';
import { createWorkspace } from '../../workspace/index.js';
import type { Workspace } from '../../workspace/index.js';
import { deckSession } from './session.js';
const id = CardIdSchema.parse('deck001');
const workspaces: Workspace[] = [];
function board(name = 'boardaa') {
  const result = applyBatch(emptyBoard(BoardIdSchema.parse(name), 'Deck checks'), { commands: [{ op: 'create', type: 'deck', newId: id, props: { current: 0, marker: 'retain me', slides: [{ id: 'one', layout: 'title', title: 'First' }, { id: 'two', layout: 'text', title: 'Second', body: 'Unchanged' }] } }] });
  if (!result.ok) throw new Error('Invalid deck fixture');
  return result.board;
}
function setup() {
  const workspace = createWorkspace({ board: board() }); workspaces.push(workspace);
  return { workspace, session: deckSession(workspace, id) };
}
function slides(workspace: Workspace) { return workspace.card(id).getSnapshot()?.props?.slides ?? []; }
function remoteTitle(workspace: Workspace, title: string, index = 0) {
  const props = workspace.card(id).getSnapshot()?.props;
  workspace.submit([{ op: 'update', id, set: JsonRecordSchema.parse({ props: { ...props, slides: slides(workspace).map((slide, i) => i === index ? { ...slide, title } : slide) } }) }]);
}
afterEach(() => { for (const workspace of workspaces.splice(0)) workspace.dispose(); });
describe('deck sessions', () => {
  it('flushes several fields as one Undo and retains unrelated props and remote slides', () => {
    const { workspace, session } = setup();
    session.patch('one', { title: 'My title' }); session.patch('one', { sub: 'My subtitle' });
    remoteTitle(workspace, 'Remote second title', 1);
    expect(session.flush()).toBe(true);
    expect(slides(workspace).map(slide => slide.title)).toEqual(['My title', 'Remote second title']);
    expect(workspace.card(id).getSnapshot()?.props?.marker).toBe('retain me');
    workspace.undo();
    expect(slides(workspace).map(slide => slide.title)).toEqual(['First', 'Remote second title']);
    expect(slides(workspace)[0]?.sub).toBeUndefined();
  });
  it('refuses to overwrite a remote edit to the same field and retains the draft', () => {
    const { workspace, session } = setup(); session.patch('one', { title: 'Mine' }); remoteTitle(workspace, 'Theirs');
    expect(session.flush()).toBe(false); expect(slides(workspace)[0]?.title).toBe('Theirs');
    expect(session.getSnapshot().slides[0]?.title).toBe('Mine'); expect(session.getSnapshot().error).toContain('changed');
    session.useLatest(); expect(session.getSnapshot().slides[0]?.title).toBe('Theirs');
  });
  it('preserves identity through add, duplicate, move, delete and an empty deck', () => {
    const { workspace, session } = setup(); session.add(1, true);
    const duplicate = session.getSnapshot().slides[1]?.id;
    expect(duplicate).not.toBe('one'); session.move(1, 1); expect(session.flush()).toBe(true);
    expect(slides(workspace).map(slide => slide.id)).toEqual(['one', 'two', duplicate]);
    session.remove(2); session.remove(1); session.remove(0); expect(session.flush()).toBe(true);
    expect(slides(workspace)).toEqual([]); session.add(); expect(session.flush()).toBe(true);
    expect(slides(workspace)[0]?.background).toBe('plain');
  });
  it('refuses to flush IME text until composition completes', () => {
    const { workspace, session } = setup(); session.compose(true); session.patch('one', { title: '日本語' });
    expect(session.flush()).toBe(false); expect(slides(workspace)[0]?.title).toBe('First');
    session.compose(false); expect(session.flush()).toBe(true); expect(slides(workspace)[0]?.title).toBe('日本語');
  });
  it('does not submit unchanged input or create another Undo transaction', () => {
    const { workspace, session } = setup(); session.patch('one', { title: 'First' }); expect(session.flush()).toBe(true);
    expect(workspace.history.getSnapshot()).toEqual({ undo: false, redo: false });
  });
  it('never sends an unfinished draft to a replacement board with the same card ID', () => {
    const { workspace, session } = setup(); session.patch('one', { title: 'Old board draft' });
    expect(workspace.replaceBoard(board('boardbb'))).toBe(true);
    expect(session.flush()).toBe(false); expect(slides(workspace)[0]?.title).toBe('First');
    expect(deckSession(workspace, id)).not.toBe(session);
  });
  it('keeps an old implicit wave background while editing and uses plain for new slides', () => {
    const saved = board(); delete saved.cards[0]?.props?.slides?.[0]?.background;
    const workspace = createWorkspace({ board: saved }); workspaces.push(workspace);
    const session = deckSession(workspace, id); session.patch('one', { title: 'Changed old title' }); session.add(); expect(session.flush()).toBe(true);
    expect(slides(workspace)[0]?.background).toBeUndefined(); expect(slides(workspace)[2]?.background).toBe('plain');
  });
  it('updates a subscribed clean session after remote edits and Undo', () => {
    const { workspace, session } = setup(); const stop = session.subscribe(() => {});
    remoteTitle(workspace, 'Changed'); expect(session.getSnapshot().slides[0]?.title).toBe('Changed');
    workspace.undo(); expect(session.getSnapshot().slides[0]?.title).toBe('First'); stop();
  });
});
