import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';

import './index.css';

// When the frontend and backend are deployed on different domains
// (e.g. Netlify/Vercel + Render), point API calls at the backend's URL.
// Leave VITE_API_URL unset when both are served from the same origin.
if (import.meta.env.VITE_API_URL) {
  setBaseUrl(import.meta.env.VITE_API_URL);
}

createRoot(document.getElementById('root')!).render(<App />);

