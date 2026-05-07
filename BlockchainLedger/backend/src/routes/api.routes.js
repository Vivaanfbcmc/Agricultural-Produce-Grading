import express from 'express';
import TransactionController from '../controllers/transaction.controller.js';
import VerificationController from '../controllers/verification.controller.js';

const router = express.Router();

// Existing routes - UNCHANGED
router.post('/transactions', TransactionController.createTransaction);
router.get('/transactions', TransactionController.getAllTransactions);
router.get('/transactions/farmer/:farmer_id', TransactionController.getTransactionsByFarmer);

router.get('/ledger/verify', VerificationController.verifyLedger);
router.get('/ledger', VerificationController.getLedger);

// ============ NEW ROUTES FOR HISTORY PAGE ============

// Get transaction history (supports ?farmerId=X query parameter)
router.get('/history', TransactionController.getTransactionHistory);

// Get single transaction details
router.get('/transaction/:id', TransactionController.getTransactionById);

// Get farmer statistics
router.get('/farmer/:farmerId/stats', TransactionController.getFarmerStats);

export default router;