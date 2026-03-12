import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRoutes from './routes/api.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ 
    message: 'Agricultural Blockchain Ledger System',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      api: '/api',
      transactions: '/api/transactions',
      ledger: '/api/ledger',
      verify: '/api/ledger/verify'
    }
  });
});

app.use('/api', apiRoutes);

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Blockchain ledger server running',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Immutable ledger system active`);
  console.log(`Database: ${process.env.DB_NAME}`);
});

process.on('uncaughtException', (error) => {
  console.error('Server Error:', error.message);
});
