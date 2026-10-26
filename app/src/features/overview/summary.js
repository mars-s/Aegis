const paths = {
  Document: 'M4 2h8l4 4v16H4zM12 2v5h4M7 11h6M7 15h6M7 19h4',
  Sheet: 'M3 4h18v16H3zM3 9h18M3 14h18M9 4v16M15 4v16',
  Dataset: 'M3 4h18v16H3zM3 9h18M3 14h18M9 4v16M15 4v16',
  Deck: 'M3 4h18v13H3zM8 22l4-5 4 5M7 8h10M7 12h6',
  Plot: 'M3 3v18h18M6 16l5-6 4 3 6-8',
  'Custom UI': 'M8 6l-6 6 6 6M16 6l6 6-6 6M14 3l-4 18',
};

export function summaryContent(summary) {
  const content = document.createElement('span'); content.className = 'semantic-content';
  content.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[summary.kind] || 'M4 3h16v18H4zM8 8h8M8 12h8M8 16h5'}"/></svg><span class="semantic-copy"><span class="semantic-kind"></span><strong></strong></span>`;
  const copy = content.querySelector('.semantic-copy');
  copy.querySelector('.semantic-kind').textContent = summary.kind;
  copy.querySelector('strong').textContent = summary.title;
  for (const fact of summary.facts) { const line = document.createElement('span'); line.className = 'semantic-fact'; line.textContent = fact; copy.append(line); }
  return content;
}
