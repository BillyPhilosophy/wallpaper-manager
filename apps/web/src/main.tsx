import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AppearanceProvider } from './features/appearance/AppearanceContext';
import { BrowserCacheProvider } from './features/browser-cache/BrowserCacheContext';
import './styles.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserCacheProvider><AppearanceProvider><BrowserRouter><App/></BrowserRouter></AppearanceProvider></BrowserCacheProvider></React.StrictMode>);
