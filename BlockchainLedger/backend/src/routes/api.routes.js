import express from 'express';
import TransactionController from '../controllers/transaction.controller.js';
import VerificationController from '../controllers/verification.controller.js';

const router = express.Router();

router.post('/transactions', TransactionController.createTransaction);
router.get('/transactions', TransactionController.getAllTransactions);
router.get('/transactions/farmer/:farmer_id', TransactionController.getTransactionsByFarmer);

router.get('/ledger/verify', VerificationController.verifyLedger);
router.get('/ledger', VerificationController.getLedger);

export default router;
