-- Add Farmer fields
ALTER TABLE farmers ADD COLUMN district varchar(100);
ALTER TABLE farmers ADD COLUMN state varchar(100);
ALTER TABLE farmers ADD COLUMN email varchar(100);
ALTER TABLE farmers ADD COLUMN password varchar(255);

-- Add Blockchain fields to Ledger for Sepolia anchoring
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS blockchain_tx_hash VARCHAR(66);
ALTER TABLE ledger ADD COLUMN IF NOT EXISTS block_number BIGINT;

-- Ensure ledger_blockchain_proof table has farmer_id field
ALTER TABLE ledger_blockchain_proof ADD COLUMN IF NOT EXISTS farmer_id VARCHAR(50) REFERENCES farmers(id);

-- Create index for farmer_id if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_proof_farmer ON ledger_blockchain_proof(farmer_id);
