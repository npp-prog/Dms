import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { isConfigured } from './firebase.js';
import './styles.css';

function NotConfigured() {
  return (
    <div className="center-screen">
      <div className="card narrow">
        <h2>Firebase is not configured</h2>
        <p>Set the <code>VITE_FIREBASE_*</code> environment variables (see <code>.env.example</code>) in
          <code>.env.local</code> for local development, or in Netlify&rsquo;s site environment variables, then rebuild.</p>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isConfigured ? (
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    ) : <NotConfigured />}
  </React.StrictMode>,
);
