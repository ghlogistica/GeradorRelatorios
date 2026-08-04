const express = require('express');
const cors = require('cors');
const apiRoutes = require('./api');

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors()); // Allow frontend to call the API
app.use(express.json());

// Routes
app.use('/api', apiRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Servidor Backend rodando na porta ${PORT}`);
});
