// Ported from Mochiboard (github.com/jessawolfe-ux/mochiboard, MIT, (c) 2026 Jessa Wolfe). See LICENSE.mochiboard.
// Independently implemented layouts and prompts. Frameworks use the shared collection model.
const title = text => ({ t: 'title', x: 0, y: 0, text });
const group = (x, y, text, color, notes) => ({ t: 'group', x, y, text, color, notes });
const note = (x, y, text, color = 'plain', key) => ({ t: 'note', x, y, text, color, key });
export const frameworks = {
  affinity: { name: 'Affinity map', items: [title('Affinity map'), group(0, 90, 'Observations', 'gray', ['Record a comment from your research.', 'Add another observation.', 'What happened?', 'What caused confusion?']), group(330, 90, 'A shared theme', 'red', ['Move related observations into this group.', 'Describe the pattern you found.']), group(660, 90, 'Another theme', 'green', ['Collect a different pattern here.'])], guide: 'Write one observation on each note. Gather related notes into groups, then give each group a name that explains the finding.' },
  opportunity: { name: 'Opportunity map', items: [title('Opportunity map'), note(330, 90, 'Outcome: more people complete setup', 'blue', 'outcome'), note(120, 300, 'Need: understand why details are needed', 'yellow', 'need1'), note(540, 300, 'Need: finish setup with less effort', 'yellow', 'need2'), note(0, 510, 'Idea: explain each request', 'green', 'idea1'), note(240, 510, 'Idea: allow optional steps later', 'green', 'idea2'), note(540, 510, 'Idea: keep progress between visits', 'green', 'idea3'), note(0, 720, 'Experiment: try the revised screen with five people', 'purple', 'test')], links: [['outcome', 'need1'], ['outcome', 'need2'], ['need1', 'idea1'], ['need1', 'idea2'], ['need2', 'idea3'], ['idea1', 'test']], guide: 'Put a measurable outcome at the top. Add needs found in research below it, followed by possible solutions and a small experiment. Connect each idea to the need it addresses.', guideX: 900 },
  matrix: { name: 'Impact / effort', items: [title('Impact / effort'), group(0, 90, 'Quick wins', 'green', ['High impact, low effort']), group(330, 90, 'Larger investments', 'blue', ['High impact, high effort']), group(0, 360, 'Small improvements', 'yellow', ['Low impact, low effort']), group(330, 360, 'Leave for later', 'red', ['Low impact, high effort'])], guide: 'Write one idea per note. Compare the benefit and effort, then place it in a quadrant. Choose a useful, manageable change to try first.', guideX: 660 },
  empathy: { name: 'Empathy map', items: [title('Empathy map'), note(245, 90, 'Person: who are we learning about?', 'purple'), group(0, 270, 'Says', 'blue', ['Use an exact research quote.']), group(330, 270, 'Thinks', 'purple', ['What concern is behind the words?']), group(0, 520, 'Does', 'yellow', ['Describe an action you observed.']), group(330, 520, 'Feels', 'red', ['What emotion did they describe?'])], guide: 'Choose one person or audience. Use research evidence for each section. Look for differences between what people say and what they do.', guideX: 660 },
  journey: { name: 'Journey map', items: [title('Journey map'), group(0, 90, '1. Discovery', 'blue', ['How do they find out about it?', 'Feeling: interested']), group(300, 90, '2. Getting started', 'purple', ['What steps do they take?', 'Difficulty: too many requests']), group(600, 90, '3. First result', 'yellow', ['What useful result do they get?']), group(900, 90, '4. Return visit', 'green', ['Why would they come back?'])], guide: 'Read the steps from left to right. Add actions, feelings and difficulties beneath each step. Rename the steps to match the journey you observed.', guideX: 1200 },
  hmw: { name: 'How might we', items: [title('How might we'), group(0, 90, 'Research problems', 'red', ['People stop before completing setup.']), group(330, 90, 'Questions to explore', 'yellow', ['How might we make the first step clearer?', 'How might we reduce the information needed?'])], guide: 'Turn each research problem into an open question. Keep the question specific enough to start exploring and broad enough to allow several answers.', guideX: 660 },
  rtb: { name: 'Rose, thorn, bud', items: [title('Rose, thorn, bud'), group(0, 90, 'Rose: successes', 'red', ['What helped the team?']), group(330, 90, 'Thorn: difficulties', 'orange', ['What made the work harder?']), group(660, 90, 'Bud: possibilities', 'green', ['What would you like to try?'])], guide: 'Take a few quiet minutes to write. Share the notes, group related thoughts and choose one practical improvement for the next round.' },
};
export const starters = {
  Moodboard: [title('Moodboard'), note(0, 60, 'Describe the mood in a few words.', 'yellow'), note(250, 60, 'Drop visual references onto this board.', 'red'), note(500, 60, 'Choose a colour palette.', 'green'), { t: 'swatch', x: 0, y: 260, text: 'Blush', hex: '#ff9ec4' }, { t: 'swatch', x: 130, y: 260, text: 'Cream', hex: '#fff5c8' }, { t: 'swatch', x: 260, y: 260, text: 'Mint', hex: '#7ad3a3' }, { t: 'todo', x: 500, y: 240, text: 'Next steps', items: ['Gather references', 'Choose typefaces', 'Review with the team'] }],
  'App plan': [title('App plan'), note(0, 60, 'Describe the intended audience.', 'blue'), note(250, 60, 'What problem needs solving?', 'red'), note(500, 60, 'What is the main benefit?', 'yellow'), { t: 'todo', x: 0, y: 260, text: 'Screens to plan', items: ['Welcome', 'Main screen', 'Preferences'] }, note(280, 260, 'Compare existing options and their gaps.', 'purple')],
  'Brain dump': [title('Brain dump'), note(0, 60, 'Capture with ⇧⌘K. Move ideas from Unsorted onto the board.', 'yellow')],
};
export function templateCommands(key, board, makeId = () => Math.random().toString(36).slice(2, 12).padEnd(8, '0')) {
  const framework = frameworks[key], items = framework?.items ?? starters[key];
  if (!items) throw new Error('Unknown template.');
  const commands = [], keyed = {};
  const x0 = board.cards.length ? Math.max(...board.cards.map(c => c.x + c.w)) + 200 : 0;
  const y0 = board.cards.length ? Math.min(...board.cards.map(c => c.y)) : 0;
  const add = (type, values) => { const newId = makeId(); commands.push({ op: 'create', type, newId, ...values }); return newId; };
  for (const it of items) {
    const pos = { x: x0 + it.x, y: y0 + it.y };
    if (it.t === 'group') {
      const id = add('coll', { ...pos, w: 288, text: it.text, color: it.color, props: { kids: [], cols: 1 } });
      const kids = it.notes.map(text => add('note', { ...pos, w: 264, h: 106, text, color: it.color }));
      commands.push({ op: 'update', id, set: { props: { kids, cols: 1 } } });
    } else {
      const id = add(it.t, { ...pos, text: it.text, color: it.color ?? 'plain', ...(it.t === 'todo' ? { items: it.items.map(text => ({ text, done: false })) } : {}), ...(it.t === 'swatch' ? { w: 120, h: 150, props: { hex: it.hex, label: it.text } } : {}) });
      if (it.key) keyed[it.key] = id;
    }
  }
  if (framework) add('note', { x: x0 + (framework.guideX ?? 990), y: y0 + 90, w: 280, h: 300, text: `How to use this template\n\n${framework.guide}` });
  for (const [a, b] of framework?.links ?? []) {
    const id = makeId();
    commands.push({ op: 'connect', newId: id, a: keyed[a], b: keyed[b] }, { op: 'link_update', id, set: { arrow: 'end' } });
  }
  if (starters[key]) {
    const tray = key === 'Brain dump' ? ['A task to finish', 'An idea to explore', 'Something to follow up', 'A reference to find', 'A question to answer'].map(text => ({ id: makeId(), type: 'note', text, x: 0, y: 0, w: 220, h: 140, color: 'plain' })) : [];
    commands.push({ op: 'board_set', set: { tray } });
  }
  return commands;
}

export function expandTemplateDrag(cards, board) {
  const ids = new Set(cards.map(c => c.id));
  for (const c of cards) if (c.type === 'template-group') board.cards.filter(k => k.parent === c.id).forEach(k => ids.add(k.id));
  return board.cards.filter(c => ids.has(c.id));
}
export function templateDropCommands(cards, board, kind) {
  if (kind !== 'move') return [];
  return cards.filter(c => c.type === 'note').flatMap(c => {
    if (cards.some(parent => parent.id === c.parent && parent.type === 'template-group')) return [];
    const group = [...board.cards].reverse().find(g => g.type === 'template-group' && c.x + c.w / 2 > g.x && c.x + c.w / 2 < g.x + g.w && c.y + c.h / 2 > g.y && c.y + c.h / 2 < g.y + g.h);
    const previous = board.cards.find(p => p.id === c.parent);
    if (!group && previous?.type !== 'template-group') return [];
    return (c.parent || '') === (group?.id || '') ? [] : [{ op: 'update', id: c.id, set: { parent: group?.id || '' } }];
  });
}
