'use client';

import { Component, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { Canvas, useThree, _roots, type CanvasProps } from '@react-three/fiber';
import * as THREE from 'three';
import { graphicsSession, webgl2Context } from '@/lib/graphics-session';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';

export function useGraphicsStatus() {
  return useSyncExternalStore(graphicsSession.subscribe, graphicsSession.getSnapshot, graphicsSession.getSnapshot);
}

function GraphicsFallback() {
  return <div className="scene-fallback graphics-fallback" role="status">
    <strong>3D view unavailable</strong>
    <p>Chat, Explore and Add are still available.</p>
    <button className="btn" onClick={() => graphicsSession.setHelpOpen(true)}>Graphics help</button>
  </div>;
}

class GraphicsBoundary extends Component<{ children: ReactNode; attempt: number }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { graphicsSession.fail('scene', this.props.attempt); }
  render() { return this.state.failed ? <GraphicsFallback /> : this.props.children; }
}

function ContextLossMonitor({ attempt }: { attempt: number }) {
  const gl = useThree(state => state.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => {
      event.preventDefault();
      gl.setAnimationLoop(null);
      graphicsSession.fail('context-lost', attempt);
    };
    canvas.addEventListener('webglcontextlost', lost);
    if (gl.getContext().isContextLost()) graphicsSession.fail('context-lost', attempt);
    return () => canvas.removeEventListener('webglcontextlost', lost);
  }, [gl, attempt]);
  return null;
}

type GraphicsCanvasProps = Omit<CanvasProps, 'gl'> & {
  gl?: THREE.WebGLRendererParameters & { toneMapping?: THREE.ToneMapping; toneMappingExposure?: number };
};

function CanvasAttempt({ gl: options, children, attempt, ...props }: GraphicsCanvasProps & { attempt: number }) {
  const renderer = useMemo(() => {
    const renderers = new WeakMap<HTMLCanvasElement, THREE.WebGLRenderer>();
    return async (defaults: THREE.WebGLRendererParameters) => {
      const canvas = defaults.canvas as HTMLCanvasElement;
      const snapshot = graphicsSession.getSnapshot();
      const stop = () => {
        // Fiber 9's unmount cleanup assumes configure has already created a
        // scene. Remove this still-empty root explicitly so failed attempts do
        // not retain detached canvases in its registry.
        const root = _roots.get(canvas);
        if (root && !root.store.getState().gl) _roots.delete(canvas);
        // Fiber 9 awaits its renderer factory without catching rejection. Keep
        // that setup suspended until the failure state unmounts this Canvas.
        // No render loop starts, no rejected promise escapes, and no retry is
        // scheduled. The unconfigured root has no scene or event loop to stop.
        return new Promise<THREE.WebGLRenderer>(() => {});
      };
      if (snapshot.failure || snapshot.attempt !== attempt) return stop();
      const existing = renderers.get(canvas);
      if (existing) return existing;
      const parameters = { ...defaults, ...options };
      const context = webgl2Context(canvas, parameters);
      if (!context) {
        graphicsSession.fail('unavailable', attempt);
        return stop();
      }
      try {
        const gl = new THREE.WebGLRenderer({ ...parameters, context });
        if (options?.toneMapping !== undefined) gl.toneMapping = options.toneMapping;
        if (options?.toneMappingExposure !== undefined) gl.toneMappingExposure = options.toneMappingExposure;
        renderers.set(canvas, gl);
        return gl;
      } catch (error) {
        graphicsSession.fail('unavailable', attempt);
        console.error('RepoRoad: 3D renderer initialization failed.', error);
        try { context.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* Best-effort cleanup. */ }
        return stop();
      }
    };
    // Renderer options are fixed for this mounted attempt, just like Canvas gl.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  return <Canvas {...props} gl={renderer}>
    <ContextLossMonitor attempt={attempt} />
    {children}
  </Canvas>;
}

export function GraphicsCanvas(props: GraphicsCanvasProps) {
  const { failure, attempt } = useGraphicsStatus();
  if (failure) return <GraphicsFallback />;
  return <GraphicsBoundary key={attempt} attempt={attempt}>
    <CanvasAttempt {...props} attempt={attempt} />
  </GraphicsBoundary>;
}

export function GraphicsHelp() {
  const { failure, helpOpen, attempt } = useGraphicsStatus();
  return <Dialog open={helpOpen} onOpenChange={graphicsSession.setHelpOpen}>
    <DialogContent className="welcome-dialog graphics-dialog">
      <DialogTitle>{failure === 'scene' ? 'The 3D view couldn’t start' : '3D graphics unavailable'}</DialogTitle>
      <DialogDescription>
        {failure === 'context-lost' ? 'The browser lost its graphics connection. ' : ''}
        {failure === 'scene' ? 'The scene encountered an error. Try again to restart the 3D view.' : 'RepoRoad needs WebGL 2 for the drive and building preview. Your browser may have graphics acceleration disabled or restricted.'}
      </DialogDescription>
      <div className="graphics-instructions">
        <strong>Enable hardware acceleration</strong>
        <ol>
          <li>In Chrome, paste <code>chrome://settings/system</code> into the address bar. In Edge, use <code>edge://settings/system</code>.</li>
          <li>Turn on <b>Use graphics acceleration when available</b>.</li>
          <li>Restart your browser and reopen RepoRoad.</li>
        </ol>
        <p><b>Firefox:</b> Settings → General → Performance. Clear “Use recommended performance settings”, then enable hardware acceleration and restart.</p>
        <p>In an in-app browser, try opening RepoRoad in a regular browser. If acceleration is already enabled, update your browser and graphics driver or try another browser.</p>
      </div>
      {failure && attempt > 0 && <p role="status">The retry didn’t restore the 3D view. You can keep using the rest of RepoRoad.</p>}
      <p className="fine">Chat, Explore and Add work without 3D. Your current edits stay here when you try again.</p>
      <div className="graphics-actions">
        <button className="btn" onClick={() => graphicsSession.setHelpOpen(false)}>Continue without 3D</button>
        <button className="btn primary" onClick={graphicsSession.retry}>Try Again</button>
      </div>
    </DialogContent>
  </Dialog>;
}
