const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

let app;
let db;

try {
  app = initializeApp({
    credential: applicationDefault()
  });
  db = getFirestore(app);
  console.log('🔥 Conectado ao Firebase com sucesso!');
} catch (error) {
  console.error('❌ Erro ao inicializar o Firebase Admin. Verifique suas credenciais:', error.message);
  // Se falhar na inicialização (ex: rodando local sem o .env), db não será inicializado
  // Isso evita que o servidor crashe instantaneamente, permitindo ver os logs no Cloud Run.
}

module.exports = { app, db };
