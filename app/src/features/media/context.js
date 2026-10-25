let context;
export const setMediaContext = ctx => { context = ctx; };
export const mediaContext = () => context;
export function report(error) { context?.toast(error?.message || String(error)); }
