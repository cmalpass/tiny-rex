/**
 * jsdom ships no Canvas 2D implementation, so provide a permissive stub:
 * every method is a no-op that returns a gradient-like object, and every
 * property is settable. Tests assert game logic, never pixels.
 */
function makeCtxStub(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop) {
      if (typeof prop === 'string' && prop in target) return target[prop];
      return () => gradient;
    },
    set(target, prop, value) {
      if (typeof prop === 'string') target[prop] = value;
      return true;
    },
  };
  return new Proxy({} as Record<string, unknown>, handler) as unknown as CanvasRenderingContext2D;
}

// A single shared stub is enough; nothing inspects pixel state.
const sharedCtx = makeCtxStub();
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  writable: true,
  configurable: true,
  value: (_type: string): CanvasRenderingContext2D => sharedCtx,
});

// jsdom lacks matchMedia; touch binding guards for it, but provide a stub
// for code paths that probe it.
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  });
}
