import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Note: intentionally not wrapped in <StrictMode> — its double mount/unmount in
// dev would tear down and rebuild the MapLibre instance (and re-trigger the
// globe spin / data loads) on every render, which is visually jarring here.
createRoot(document.getElementById('root')!).render(<App />);
