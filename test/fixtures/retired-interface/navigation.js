// Fixed controls follow the visible viewport when mobile browser chrome or
// the keyboard reduces it. Pinch zoom keeps the browser's native positioning.
export function navigationViewportInset(layoutHeight, viewport) {
 if (!viewport || viewport.scale !== 1 || !Number.isFinite(layoutHeight) ||
     !Number.isFinite(viewport.height) || !Number.isFinite(viewport.offsetTop)) return 0;
 return Math.max(0, layoutHeight - viewport.height - viewport.offsetTop);
}

if (typeof window !== 'undefined' && window.visualViewport) {
 const viewport = window.visualViewport;
 let pending = false;
 const update = () => {
  pending = false;
  document.documentElement.style.setProperty('--navigation-viewport-inset',
   navigationViewportInset(window.innerHeight, viewport) + 'px');
 };
 const schedule = () => {
  if (pending) return;
  pending = true;
  window.requestAnimationFrame(update);
 };
 viewport.addEventListener('resize', schedule, {passive:true});
 viewport.addEventListener('scroll', schedule, {passive:true});
 window.addEventListener('resize', schedule, {passive:true});
 window.addEventListener('pageshow', schedule);
 update();
}
