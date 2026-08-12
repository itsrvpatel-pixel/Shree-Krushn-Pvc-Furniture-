import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { installWindowStorage } from './firebaseStorage.js';

installWindowStorage();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
