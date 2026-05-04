import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import CommitDiffPage from './components/CommitDiffPage';
import './index.css';

const params = new URLSearchParams(window.location.search);
const view = params.get('view');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {view === 'commit' ? <CommitDiffPage /> : <App />}
  </React.StrictMode>
);
