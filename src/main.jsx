// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Lock to portrait on devices that support it (Android Chrome, installed PWA)
if (screen?.orientation?.lock) {
  screen.orientation.lock('portrait').catch(() => {})
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
