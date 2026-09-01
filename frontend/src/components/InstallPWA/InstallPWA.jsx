import React, { useState, useEffect } from 'react';
import './InstallPWA.css';

const InstallPWA = () => {
  const [supportsPWA, setSupportsPWA] = useState(false);
  const [promptInstall, setPromptInstall] = useState(null);

  useEffect(() => {
    const handler = e => {
      e.preventDefault();
      console.log('Evento beforeinstallprompt disparado!');
      setSupportsPWA(true);
      setPromptInstall(e);
    };
    
    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const onClick = evt => {
    evt.preventDefault();
    if (!promptInstall) {
      return;
    }
    promptInstall.prompt();
  };

  if (!supportsPWA) {
    return null; // ou não renderiza nada se não suportar PWA ou se já estiver instalado
  }

  return (
    <div className="install-pwa-container">
      <div className="install-pwa-card">
        <div className="install-pwa-icon">
          <img src="/img/ICON.png" alt="App Icon" />
        </div>
        <div className="install-pwa-content">
          <h3>Instale o App</h3>
          <p>Tenha acesso rápido direto da sua tela inicial.</p>
        </div>
        <button onClick={onClick} className="install-pwa-button">
          Baixar App
        </button>
      </div>
    </div>
  );
};

export default InstallPWA;
