// Global error handler to catch any unhandled errors
window.addEventListener('error', (event) => {
  const errorMessage = event.message || event.error?.message || '';
  const errorString = String(errorMessage).toLowerCase();
  
  // Suppress ResizeObserver loop errors - these are harmless browser quirks
  if (errorString.includes('resizeobserver') && 
      (errorString.includes('loop') || errorString.includes('completed'))) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  
  // Suppress CORS errors for edge functions - these are handled gracefully
  if (errorString.includes('cors') || errorString.includes('blocked by cors policy')) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  
  // Suppress network errors that are expected (403, 404, etc.)
  if (errorString.includes('failed to fetch') || 
      errorString.includes('networkerror') ||
      errorString.includes('load failed')) {
    // Only suppress if it's a CORS or network issue, not a real application error
    if (errorString.includes('cors') || errorString.includes('blocked')) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
  }
  
  console.error('[Global Error Handler]', event.error);
  if (document.body) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; background: #dc2626; color: white; padding: 20px; z-index: 9999; font-family: system-ui;';
    errorDiv.innerHTML = `
      <strong>Application Error:</strong> ${event.error?.message || event.message || 'Unknown error'}
      <br><small>Check the browser console for details.</small>
    `;
    document.body.appendChild(errorDiv);
  }
});

// Catch unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const errorMessage = reason?.message || String(reason || '').toLowerCase();
  
  // Suppress ResizeObserver errors in promise rejections
  if (errorMessage.includes('resizeobserver') && 
      (errorMessage.includes('loop') || errorMessage.includes('completed'))) {
    event.preventDefault();
    return;
  }
  
  // Suppress CORS errors in promise rejections
  if (errorMessage.includes('cors') || errorMessage.includes('blocked by cors policy')) {
    event.preventDefault();
    return;
  }
  
  console.error('[Unhandled Promise Rejection]', event.reason);
});

import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Initialize Sentry for production error tracking
if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.05,
    beforeSend(event) {
      // Filter out ResizeObserver and CORS noise
      const message = event.exception?.values?.[0]?.value?.toLowerCase() || '';
      if (message.includes('resizeobserver') || message.includes('cors')) {
        return null;
      }
      return event;
    },
  });
}

console.log("[main.tsx] Starting app initialization...");

const rootElement = document.getElementById("root");
console.log("[main.tsx] Root element:", rootElement);

if (!rootElement) {
  console.error("[main.tsx] CRITICAL: Root element not found!");
  document.body.innerHTML = '<div style="color: red; padding: 20px; font-family: system-ui;">ERROR: Root element not found. Check index.html</div>';
} else {
  console.log("[main.tsx] Rendering App...");
  try {
    createRoot(rootElement).render(<App />);
    console.log("[main.tsx] App render called successfully");
  } catch (error) {
    console.error("[main.tsx] CRITICAL ERROR during render:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';
    document.body.innerHTML = `
      <div style="padding: 40px; font-family: system-ui; max-width: 800px; margin: 50px auto;">
        <h1 style="color: #dc2626; margin-bottom: 20px;">Application Error</h1>
        <p style="color: #374151; margin-bottom: 10px;"><strong>Error:</strong> ${errorMessage}</p>
        ${errorStack ? `<pre style="background: #f3f4f6; padding: 15px; border-radius: 4px; overflow-x: auto; color: #6b7280; font-size: 12px;">${errorStack}</pre>` : ''}
        <p style="color: #6b7280; margin-top: 20px;">Please check the browser console (F12) for more details.</p>
      </div>
    `;
  }
}
