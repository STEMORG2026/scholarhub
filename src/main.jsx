// Entry point. The application itself lives in src/App.jsx, which is kept free
// of any mount-time DOM access so it can also be imported and rendered outside a
// browser — that is what `scripts/render-smoke.mjs` does, and it is the only
// thing that can catch a runtime error inside a view that never renders by
// default. Splitting the entry out is what makes the component testable; before
// v0.25.0 a module-level `createRoot(document.getElementById('root'))` ran on
// import and made the whole module unloadable anywhere but a browser.
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App/>);
