// BlockchainLedger/backend/src/routes/api.routes.js
import express from 'express';
import TransactionController from '../controllers/transaction.controller.js';
import VerificationController from '../controllers/verification.controller.js';

const router = express.Router();

// Transaction routes
router.post('/transactions', TransactionController.createTransaction);
router.get('/transactions', TransactionController.getTransactions); // Supports ?farmerId=X
router.get('/transactions/:id', TransactionController.getTransactionById);

// Farmer statistics
router.get('/farmers/:farmerId/stats', TransactionController.getFarmerStats);

// Ledger routes
router.get('/ledger', VerificationController.getLedger);
router.get('/ledger/verify', VerificationController.verifyLedger);

// Health check
router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'blockchain-ledger',
        timestamp: new Date().toISOString()
    });
});

export default router;