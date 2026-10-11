export type GraphicsFailure = 'unavailable' | 'context-lost' | 'scene';

// Shared by every canvas in a browser tab. A tab switch or clock update must
// never retry a failed renderer; only the explicit retry action resets it.
export function createGraphicsSession() {
  let state = { attempt: 0, failure: null as GraphicsFailure | null, helpOpen: false };
  const listeners = new Set<() => void>();
  function update(patch: Partial<typeof state>) {
    state = { ...state, ...patch };
    listeners.forEach(listener => listener());
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    fail(failure: GraphicsFailure, attempt = state.attempt) {
      if (attempt === state.attempt && !state.failure) update({ failure, helpOpen: true });
    },
    setHelpOpen(helpOpen: boolean) { update({ helpOpen }); },
    retry() { update({ attempt: state.attempt + 1, failure: null, helpOpen: false }); },
  };
}

export const graphicsSession = createGraphicsSession();

// Request WebGL2 on the actual canvas before Three.js can attempt its own
// initialization. This also covers browsers which throw instead of returning null.
export function webgl2Context(canvas: HTMLCanvasElement, attributes?: WebGLContextAttributes) {
  try { return canvas.getContext('webgl2', attributes); }
  catch { return null; }
}
