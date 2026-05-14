import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

function App() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">AI Employee Dashboard</h1>
      <p className="text-muted-foreground">Loading...</p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
