import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AppearanceProvider } from './features/appearance/AppearanceContext';
import './styles.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><AppearanceProvider><BrowserRouter><App/></BrowserRouter></AppearanceProvider></React.StrictMode>);
