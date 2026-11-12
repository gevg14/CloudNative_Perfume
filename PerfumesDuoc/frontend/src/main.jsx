import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { PublicClientApplication } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { msalConfig, AUTH_MODE } from './authConfig.js';
import './index.css';

const msalInstance = AUTH_MODE === 'azure' ? new PublicClientApplication(msalConfig) : null;

function Root() {
  const tree = (
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  );
  return AUTH_MODE === 'azure' ? <MsalProvider instance={msalInstance}>{tree}</MsalProvider> : tree;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
