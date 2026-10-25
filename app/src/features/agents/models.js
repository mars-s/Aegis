export const modelValue = model => `${model.provider}|${model.modelId}`;
export function modelChoice(value) {
  const [provider, modelId] = String(value || '').split('|');
  return provider && modelId ? { provider, modelId } : undefined;
}
export function defaultStatusModel(list, ready = () => true) {
  const connected = list.filter(ready), available = connected.length ? connected : list;
  return available.find(m => /luna|haiku/.test(m.modelId)) ?? available.find(m => m.provider === 'fake') ?? available.at(-1) ?? list.at(-1);
}
export function mountModelSettings(container) {
  const section = document.createElement('section'); section.className = 'sheet-sec model-settings';
  section.innerHTML = '<h3>Models</h3><label>Agent model <select id="agentModel" aria-label="Agent model"></select></label><label>Status model <select id="statusModel" aria-label="Status model"></select></label><p class="muted small">A small model writes the live activity phrase.</p>';
  container.append(section);
  const source = document.getElementById('model'), agent = section.querySelector('#agentModel'), status = section.querySelector('#statusModel');
  const sync = () => {
    agent.replaceChildren(...[...source.options].map(o => o.cloneNode(true))); agent.value = source.value;
    status.replaceChildren(...[...source.options].map(o => o.cloneNode(true))); status.value = localStorage.getItem('aegis:status-model');
  };
  agent.onchange = () => { source.value = agent.value; source.dispatchEvent(new Event('change')); };
  status.onchange = () => localStorage.setItem('aegis:status-model', status.value);
  source.addEventListener('change', () => { agent.value = source.value; });
  document.addEventListener('aegis-models', sync); sync();
}
