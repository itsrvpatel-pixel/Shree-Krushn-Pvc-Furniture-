import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { installWindowStorage } from './firebaseStorage.js';

installWindowStorage();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Analytics />
    <SpeedInsights />
  </React.StrictMode>
);