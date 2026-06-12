import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { MoonPayProvider } from '@moonpay/moonpay-react';
import App from './App';
import './styles/globals.css';
// Web3Modal is initialized lazily when user clicks Connect Wallet
// See: hooks/useWallet.js connectWalletConnect() and lib/web3modal.js

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 60000,
      gcTime: 1000 * 60 * 60 * 24, // keep cached data for 24h
    },
  },
});

// Persist the query cache to localStorage so markets render instantly on
// repeat visits / reloads while fresh data is fetched in the background.
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'PredictMe-query-cache',
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || 'placeholder'}>
      <MoonPayProvider
        apiKey={import.meta.env.VITE_MOONPAY_API_KEY}
        environment={import.meta.env.VITE_MOONPAY_ENV === 'live' ? 'production' : 'sandbox'}
      >
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 }}
        >
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </PersistQueryClientProvider>
      </MoonPayProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>
);
