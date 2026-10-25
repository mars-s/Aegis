// PM6 finding 1: every agent display reads this one ordered state store.
export function createAgentState() {
  const agents = new Map(), events = new Map(), reads = new Map();
  let readId = 0;
  const revisionOf = agent => Number.isSafeInteger(agent?.revision) && agent.revision >= 0 ? agent.revision : null;
  function merge(agent, read) {
    const revision = revisionOf(agent), currentRevision = revisionOf(agents.get(agent.id));
    if (revision !== null && currentRevision !== null) {
      if (revision <= currentRevision) return false;
    } else if (read && ((events.get(agent.id) ?? 0) !== (read.events.get(agent.id) ?? 0) || read.id < (reads.get(agent.id) ?? 0))) {
      // Legacy hosts have no revisions. Only trust reads uninterrupted by events for this agent.
      return false;
    }
    agents.set(agent.id, agent);
    if (read) reads.set(agent.id, Math.max(read.id, reads.get(agent.id) ?? 0));
    return true;
  }
  return {
    get: id => agents.get(id),
    values: () => agents.values(),
    beginRead: () => ({ id: ++readId, events: new Map(events) }),
    mergeSnapshot: (agent, read) => merge(agent, read),
    mergeEvent(agent) {
      events.set(agent.id, (events.get(agent.id) ?? 0) + 1);
      return merge(agent);
    },
  };
}
