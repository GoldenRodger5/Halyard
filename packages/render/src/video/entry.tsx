/**
 * Remotion bundle entry point.
 *
 * The worker bundles this file, then selects a composition by id and renders it
 * with per-render props. Keeping the entry separate from `index.tsx` means the
 * bundler never pulls the Node-only image pipeline (sharp, resvg) into a browser
 * bundle.
 */
import { registerRoot } from 'remotion';
import { RemotionRoot } from './root.js';

registerRoot(RemotionRoot);
