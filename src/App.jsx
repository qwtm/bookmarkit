// ARCH-07: Top-level ErrorBoundary catches any unhandled render errors in BookmarkApp.
// UX-08: Popup size constraints applied when running as a Chrome extension popup.

import React from 'react';
import './App.css';
import BookmarkApp from './components/BookmarkApp.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

// UX-08: Detect popup context by checking chrome.extension.getViews or window dimensions.
// Popup windows are constrained by Chrome to a max width of ~800px and height of ~600px.
const isPopup =
  typeof chrome !== 'undefined' &&
  chrome.runtime &&
  typeof chrome.extension !== 'undefined' &&
  typeof chrome.extension.getViews === 'function' &&
  chrome.extension.getViews({ type: 'popup' }).some((v) => v === window);

function App() {
  return (
    // UX-08: Apply popup size constraints so the UI fits inside the extension popup window.
    <div style={isPopup ? { width: 600, minHeight: 400, maxHeight: 580, overflow: 'hidden' } : {}}>
      <ErrorBoundary fallbackMessage="BookmarkIt encountered an unexpected error. Please reload.">
        <BookmarkApp />
      </ErrorBoundary>
    </div>
  );
}

export default App;
