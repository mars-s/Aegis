// The reticle cursor: a dot that tracks the pointer exactly, and four corner brackets that lock on to
// whatever a click would hit (a card, a button, a row). Original Aegis art, drawn with CSS.
const TARGETS = '.card, button, a, select, summary, label.todo-item, .tree-row, .layer-row, [role="button"], .resize-handle';
// Over these the Mac's own cursor is clearer (text caret, video scrubber, panel resizing).
const NATIVE = 'input, textarea, select, video, [contenteditable]:focus, .resize-handle, .side-resize';
const PAD = 5, FREE = 9;

export function createCursor({ native = false } = {}) {
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const root = document.createElement('div');
  root.className = 'reticle'; root.setAttribute('aria-hidden', 'true');
  root.innerHTML = '<i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i><b class="dot"></b><span class="cur-label"></span>';
  document.body.appendChild(root);
  const [tl, tr, bl, br] = root.querySelectorAll('i'), dot = root.querySelector('.dot'), label = root.querySelector('.cur-label');
  let enabled = false, last = null, target = null, frame = 0, inset = 0;

  function render() {
    frame = 0; if (!last) return;
    const { clientX: x, clientY: y } = last;
    dot.style.transform = `translate(${x}px, ${y}px)`;
    label.style.transform = `translate(${x + 14}px, ${y + 12}px)`;
    let r;
    if (target && !target.isConnected) { target = null; root.classList.remove('locked'); }
    if (target) {
      const b = target.getBoundingClientRect();
      r = { x0: b.left - PAD + inset, y0: b.top - PAD + inset, x1: b.right + PAD - inset, y1: b.bottom + PAD - inset };
    } else {
      const f = FREE - inset * 0.6;
      r = { x0: x - f, y0: y - f, x1: x + f, y1: y + f };
    }
    tl.style.transform = `translate(${r.x0}px, ${r.y0}px)`;
    tr.style.transform = `translate(${r.x1}px, ${r.y0}px) scaleX(-1)`;
    bl.style.transform = `translate(${r.x0}px, ${r.y1}px) scaleY(-1)`;
    br.style.transform = `translate(${r.x1}px, ${r.y1}px) scale(-1)`;
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(render); };

  addEventListener('pointermove', e => {
    if (!enabled || e.pointerType !== 'mouse') return;
    last = e; root.classList.add('show');
    const t = e.target;
    const edge = native && (e.clientX < 6 || e.clientY < 6 || e.clientX > innerWidth - 6 || e.clientY > innerHeight - 6);
    const useNative = edge || !!t.closest?.(NATIVE);
    document.body.classList.toggle('cur-native', useNative); root.classList.toggle('hide', useNative);
    // Cards inside a tool's placement mode don't lock: the next click goes to empty canvas.
    const next = useNative || document.body.classList.contains('placing') ? null : t.closest?.(TARGETS) ?? null;
    if (next !== target) { target = next; root.classList.toggle('locked', !!target); }
    schedule();
  }, { passive: true, capture: true });
  // Panning and zooming move cards under a still pointer; keep the brackets on them.
  addEventListener('wheel', () => enabled && target && schedule(), { passive: true, capture: true });
  addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && enabled) { inset = 3; root.classList.add('down'); schedule(); } }, true);
  addEventListener('pointerup', () => { if (enabled) { inset = 0; root.classList.remove('down'); schedule(); } }, true);
  document.addEventListener('pointerleave', () => root.classList.remove('show'));
  addEventListener('blur', () => root.classList.remove('show'));

  function apply(on) {
    enabled = on && fine.matches;
    document.body.classList.toggle('fancy-cursor', enabled);
    if (!enabled) root.classList.remove('show');
  }
  fine.addEventListener('change', () => apply(enabled));
  return {
    set enabled(on) { apply(on); },
    get enabled() { return enabled; },
    // A short word beside the pointer, e.g. the tool about to be placed.
    label(text) { label.textContent = text ?? ''; root.classList.toggle('labelled', !!text); },
  };
}
