import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './Login.css'; // I will create a basic CSS inside here or create the file next

export default function Login() {
  const { loginWithGoogle, error } = useAuth();

  return (
    <div className="login-container">
      <div className="login-box">
        <img src="https://buckettiimagens.s3.us-east-2.amazonaws.com/Imagens-s3/logo+GH+branco.png" alt="GH Logo" className="login-logo" />
        <h2>Acesso Restrito</h2>
        <p>Faça login com sua conta do Google corporativa para acessar o sistema de Documentos e Relatórios.</p>
        
        {error && <div className="error-alert">{error}</div>}

        <button className="btn-google" onClick={loginWithGoogle}>
          <img src="https://developers.google.com/identity/images/g-logo.png" alt="Google Logo" />
          Fazer Login com Google
        </button>
      </div>
    </div>
  );
}
