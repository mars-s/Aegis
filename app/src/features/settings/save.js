// Failed batches stay in order, including later edits, until the user retries.
export function createSaveQueue({ post, reload, changed, failed }) {
  const queue = [];
  let running = null, blocked = false;
  function flush() {
    if (running || blocked || !queue.length) return running ?? Promise.resolve();
    changed('saving');
    running = (async () => {
      do {
        while (queue.length) {
          const entry = queue[0];
          try {
            const result = await post(entry.id, entry.commands);
            if (!result.ok) throw new Error(result.errors?.[0]?.reason ?? 'That change was refused');
            queue.shift();
          } catch (error) {
            blocked = true; changed('not saved'); failed(error); return;
          }
        }
        try { await reload(); } catch (error) { failed(error); }
      } while (queue.length);
      changed('saved');
    })().finally(() => { running = null; if (!blocked && queue.length) void flush(); });
    return running;
  }
  changed('saved');
  return {
    add(id, commands) { queue.push({ id, commands }); return flush(); },
    retry() { blocked = false; return flush(); },
    get pending() { return queue.length > 0; },
    get settled() { return running ?? Promise.resolve(); },
  };
}
