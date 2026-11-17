import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/common/Toast';
import { AuthProvider } from './context/AuthContext';
import './index.css';
import './warehouse-system.css';
import './atrium-theme.css';

// Inisialisasi Microsoft Clarity hanya saat live di production & jika Project ID tersedia
const clarityId = import.meta.env.VITE_CLARITY_ID;
if (import.meta.env.PROD && clarityId) {
  (function (c, l, a, r, i, t, y) {
    c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
    t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i;
    y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
  })(window, document, "clarity", "script", clarityId);
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2.5rem', fontFamily: 'system-ui, sans-serif', maxWidth: '800px', margin: '2rem auto' }}>
          <div style={{ backgroundColor: '#FEE2E2', border: '1px solid #F87171', borderRadius: '12px', padding: '1.5rem' }}>
            <h2 style={{ color: '#991B1B', margin: '0 0 0.75rem 0', fontSize: '1.25rem' }}>⚠️ Terjadi Kendala Render (Runtime Error)</h2>
            <p style={{ color: '#B91C1C', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Pesan kesalahan berikut ditangkap oleh sistem pelindung aplikasi:
            </p>
            <pre style={{ backgroundColor: '#FFFFFF', padding: '1rem', borderRadius: '8px', border: '1px solid #FECACA', color: '#DC2626', fontSize: '0.85rem', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
              {this.state.error?.toString()}
              {'\n\n'}
              {this.state.error?.stack}
            </pre>
            <button
              onClick={() => { localStorage.clear(); window.location.href = '/login'; }}
              style={{ marginTop: '1rem', padding: '0.6rem 1.2rem', backgroundColor: '#17191C', color: '#FFF', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
            >
              Bersihkan Sesi & Kembali ke Login
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
