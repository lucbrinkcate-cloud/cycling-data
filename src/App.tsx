import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Landing, { type DemoKind } from './components/Landing';
import Dashboard from './components/Dashboard';
import type { Activity } from './lib/activity';
import { makeSyntheticRide } from './lib/activity';
import { loadSample, parseFitBuffer } from './lib/fit';
import { buildActivity } from './lib/activity';

type State =
  | { phase: 'landing'; loading: boolean; error: string | null }
  | { phase: 'dashboard'; activity: Activity };

export default function App() {
  const [state, setState] = useState<State>({ phase: 'landing', loading: false, error: null });

  const handleFile = useCallback(async (file: File) => {
    if (!/\.fits?$/i.test(file.name)) {
      setState({ phase: 'landing', loading: false, error: `"${file.name}" doesn't look like a .FIT file — export your activity as FIT and try again.` });
      return;
    }
    setState({ phase: 'landing', loading: true, error: null });
    try {
      const buf = await file.arrayBuffer();
      const activity = await parseFitBuffer(buf, file.name, file.size);
      setState({ phase: 'dashboard', activity });
      window.scrollTo({ top: 0 });
    } catch (err) {
      setState({
        phase: 'landing',
        loading: false,
        error: err instanceof Error ? err.message : 'Could not parse this file as FIT telemetry.',
      });
    }
  }, []);

  const handleDemo = useCallback(async (kind: DemoKind) => {
    setState({ phase: 'landing', loading: true, error: null });
    try {
      const activity =
        kind === 'ride'
          ? await loadSample('/samples/ride.fit', 'Hampshire Lanes — Morning Loop')
          : await loadSample('/samples/demo.fit', 'Inverness Canal Parkrun');
      setState({ phase: 'dashboard', activity });
      window.scrollTo({ top: 0 });
    } catch {
      // Offline or missing bundle asset → generate a synthetic ride so the
      // demo always works, exercising the identical downstream pipeline.
      try {
        const { records, session } = makeSyntheticRide();
        const activity = buildActivity(records, {
          name: 'Brenner Pass — Virtual Climb',
          device: 'Route Reel Synthetic',
          fileName: 'synthetic-brenner.fit',
          fileSize: null,
          session,
        });
        setState({ phase: 'dashboard', activity });
        window.scrollTo({ top: 0 });
      } catch (err) {
        setState({
          phase: 'landing',
          loading: false,
          error: err instanceof Error ? err.message : 'Demo failed to load.',
        });
      }
    }
  }, []);

  const reset = useCallback(() => {
    setState({ phase: 'landing', loading: false, error: null });
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <AnimatePresence mode="wait">
      {state.phase === 'landing' ? (
        <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -18 }} transition={{ duration: 0.35 }}>
          <Landing loading={state.loading} error={state.error} onFile={handleFile} onDemo={handleDemo} />
        </motion.div>
      ) : (
        <motion.div key={`dash-${state.activity.id}`} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
          <Dashboard activity={state.activity} onReset={reset} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
