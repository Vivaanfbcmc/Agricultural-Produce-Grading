import LedgerService from '../services/ledger.service.js';

class VerificationController {
  static async verifyLedger(req, res) {
    try {
      const result = await LedgerService.verifyLedger();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getLedger(req, res) {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    try {
      const entries = await LedgerService.getLedgerEntries(limit, offset);
      res.json({ ledger_entries: entries });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

export default VerificationController;
