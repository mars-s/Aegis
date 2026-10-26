// Saved slides without a background keep the original wave. Only new slides
// receive the typography default, including slides added through agent updates.
export function normaliseNewSlides(slides, previous = []) {
  const known = new Map((Array.isArray(previous) ? previous : []).map(slide => [slide?.id, slide]));
  return slides.map(slide => {
    if (!slide || typeof slide !== 'object' || slide.background != null) return slide;
    const saved = known.get(slide.id);
    if (saved && saved.background == null) return slide;
    return { ...slide, background: saved?.background ?? 'plain' };
  });
}
