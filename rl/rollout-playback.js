// Keep playback intent separate from temporary browser / viewport suspension.
export function createRolloutPlayback({renderer, controls, animate, resetClock}) {
  let ready = false;
  let visible = !window.frameElement;
  let suspended = false;
  let disposed = false;
  let animationFrame = null;
  const listeners = new AbortController();
  const options = {signal: listeners.signal};

  function cancel() {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  function schedule() {
    if (!ready || !visible || suspended || disposed || document.hidden ||
        renderer.getContext().isContextLost() || animationFrame !== null) return;
    animationFrame = requestAnimationFrame(now => {
      animationFrame = null;
      animate(now);
    });
  }

  function resume() {
    cancel();
    resetClock();
    schedule();
  }

  // Use the parent viewport, not the iframe's own always-visible document.
  const observer = window.frameElement ? new parent.IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    resume();
  }, {rootMargin: '100px'}) : null;
  observer?.observe(window.frameElement);
  document.addEventListener('visibilitychange', resume, options);
  window.addEventListener('pageshow', () => { suspended = false; resume(); }, options);
  window.addEventListener('pagehide', () => { suspended = true; cancel(); }, options);
  renderer.domElement.addEventListener('webglcontextlost', cancel, options);
  renderer.domElement.addEventListener('webglcontextrestored', resume, options);
  const resizeObserver = new ResizeObserver(() => window.dispatchEvent(new Event('resize')));
  resizeObserver.observe(renderer.domElement.parentElement);

  return {
    start() { ready = true; resume(); },
    schedule,
    dispose() {
      disposed = true;
      cancel();
      observer?.disconnect();
      resizeObserver.disconnect();
      listeners.abort();
      controls.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    }
  };
}
