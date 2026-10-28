// Continue from the scene's write phase, after its recorder has stored the frame.
// The next wheel event requests the next scene frame through the normal input path.
export async function replayScene({ engine, dispatch, plan, timeoutMs = 45000 }) {
  if (!plan.length || plan.length >= 4096) throw new Error('Replay must fit the 4096-sample scene recorder');
  let release = () => {};
  let timer;
  engine.recordMetrics(true);
  try {
    return await new Promise((resolve, reject) => {
      let issued = 0, completed = 0;
      const cameras = [];
      const afterFrame = () => {
        try {
          if (issued) {
            cameras.push({ ...engine.camera() });
            completed++;
          }
          if (completed === plan.length) {
            const samples = engine.samples();
            if (samples.length !== plan.length + 1 || samples[0].interval !== 0) throw new Error('Unexpected scene recorder frames');
            resolve({ samples: samples.slice(1).map((sample, index) => ({ ...sample, phase: plan[index].phase })), cameras });
          } else dispatch(plan[issued++]);
        } catch (error) { reject(error); }
      };
      timer = setTimeout(() => reject(new Error('Scene replay stopped producing frames')), timeoutMs);
      release = engine.registerFrameParticipant({ write: () => queueMicrotask(afterFrame) });
    });
  } finally {
    clearTimeout(timer);
    release();
    engine.recordMetrics(false);
  }
}
