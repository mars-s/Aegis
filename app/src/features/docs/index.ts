import './docs.css';
import './setup.js';
export { registerDocRewriter } from './editor.js';

// Connect Rewrite to the agent host's one-shot rewrite (uses the model picked in the composer, else the first signed-in one).
import { registerDocRewriter as connectRewriter } from './editor.js';
connectRewriter(async ({ text, how, title, around, host }: { text: string; how: string; title: string; around: string; host: any }) => {
  const [provider, modelId] = String((document.getElementById('model') as HTMLSelectElement | null)?.value ?? '').split('|');
  const r = await host.post('/rewrite', { text, how, title, around, ...(provider && modelId ? { model: { provider, modelId } } : {}) });
  return r.text;
});
