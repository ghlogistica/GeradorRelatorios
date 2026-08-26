const admin = require('firebase-admin');

// No Google Cloud Run, a autenticação normalmente é automática usando a conta de serviço padrão (Default Service Account).
// Para ambiente de desenvolvimento local (seu computador), você deve baixar a chave do Firebase Admin (JSON)
// e apontar o caminho usando a variável de ambiente GOOGLE_APPLICATION_CREDENTIALS.
// Exemplo: no seu arquivo .env, coloque: GOOGLE_APPLICATION_CREDENTIALS="./chave-firebase.json"

try {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
  console.log('🔥 Conectado ao Firebase com sucesso!');
} catch (error) {
  console.error('❌ Erro ao inicializar o Firebase Admin:', error);
}

const db = admin.firestore();

module.exports = { admin, db };
