import { importFiles } from '../media/imports.js';
import './first-minute.css';

export const weeklyPrompt = 'Help me plan my week. Ask about my priorities if you need more detail. Make an editable weekly plan and a short checklist on this board. Clearly label any example schedule as a suggestion.';

export function mountFirstMinute(ctx, actions) {
  const empty = document.getElementById('empty');
  const picker = document.createElement('input'); picker.type = 'file'; picker.accept = '.csv,text/csv'; picker.hidden = true; picker.setAttribute('aria-label', 'Import a CSV'); empty.append(picker);
  picker.addEventListener('change', async () => {
    try { if (picker.files.length) await importFiles(ctx, picker.files, ctx.canvas.centre()); }
    catch (error) { ctx.toast(error.message || 'Could not import that CSV. Try another file.'); }
    finally { picker.value = ''; }
  });
  empty.addEventListener('pointerdown', event => event.stopPropagation());
  empty.addEventListener('dblclick', event => event.stopPropagation());
  empty.addEventListener('click', event => {
    const start = event.target.closest('[data-start]')?.dataset.start;
    if (!start) return;
    event.stopPropagation();
    if (start === 'plan') actions.ask(weeklyPrompt);
    if (start === 'csv') picker.click();
    if (start === 'doc') actions.document();
  });
  return { ask: actions.ask };
}
