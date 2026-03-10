// BlockchainLedger/backend/src/routes/api.routes.js
import express from 'express';
import TransactionController from '../controllers/transaction.controller.js';

const router = express.Router();

// ── Transaction routes ─────────────────────────────────
router.post('/transactions',      TransactionController.createTransaction);
router.get('/transactions',       TransactionController.getTransactions);      // ?farmerId=X
router.get('/transactions/:id',   TransactionController.getTransactionById);

// ── Farmer stats ───────────────────────────────────────
router.get('/farmers/:farmerId/stats', TransactionController.getFarmerStats);

// ── Ledger routes (inline — no broken service dependency) ──
router.get('/ledger', async (req, res) => {
  try {
    const limit  = parseInt(req.query.limit)  || 50;
    const offset = parseInt(req.query.offset) || 0;

    const result = await (await import('../config/database.js')).default.query(
      'SELECT * FROM ledger ORDER BY id DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );

    res.json({ ledger_entries: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/ledger/verify', async (req, res) => {
  try {
    const db     = (await import('../config/database.js')).default;
    const crypto = (await import('crypto')).default;
    const result = await db.query('SELECT * FROM ledger ORDER BY id ASC');
    const entries = result.rows;

    let valid   = true;
    let message = 'Ledger integrity verified';

    for (let i = 1; i < entries.length; i++) {
      if (entries[i].previous_hash !== entries[i - 1].hash) {
        valid   = false;
        message = `Chain broken at entry ${entries[i].id}`;
        break;
      }
    }

    res.json({ valid, message, total_entries: entries.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Health check ───────────────────────────────────────
router.get('/health', (req, res) => {
  res.json({
    status:    'healthy',
    service:   'blockchain-ledger',
    timestamp: new Date().toISOString()
  });
});

export default router;