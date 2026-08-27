require('dotenv').config();
const express = require('express');
const cors = require('cors');
const apiRoutes = require('./api');

const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors()); // Allow frontend to call the API
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes
app.use('/api', apiRoutes);

// Servir arquivos estáticos do frontend
app.use(express.static(path.join(__dirname, 'public')));

// Fallback para SPA (qualquer rota não /api vai para index.html)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor Backend rodando na porta ${PORT}`);
});
