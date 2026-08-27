const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

let app;
let db;

try {
  const serviceAccountPath = path.join(__dirname, 'geradorrelatorios-c53bb-firebase-adminsdk-fbsvc-5f6329d11c.json');
  
  // Ignora o JSON local se estiver rodando no Cloud Run (variável K_SERVICE existe)
  if (fs.existsSync(serviceAccountPath) && !process.env.K_SERVICE) {
    console.log('📄 Usando chave de serviço JSON local para o Firebase...');
    const serviceAccount = require(serviceAccountPath);
    app = initializeApp({
      credential: cert(serviceAccount)
    });
  } else {
    console.log('☁️ Usando credenciais padrão do ambiente (Cloud Run) para o Firebase...');
    app = initializeApp();
  }
  
  db = getFirestore(app);
  console.log('🔥 Conectado ao Firebase com sucesso!');
} catch (error) {
  console.error('❌ Erro ao inicializar o Firebase Admin. Verifique suas credenciais:', error.message);
  // Se falhar na inicialização (ex: rodando local sem o .env), db não será inicializado
  // Isso evita que o servidor crashe instantaneamente, permitindo ver os logs no Cloud Run.
}

module.exports = { app, db };
