# Transaction & Blockchain Integration Setup Guide

## Overview
This guide explains how to use the new "Create Transaction" feature in the VEGEGRADE AI Dashboard. This feature allows farmers to record their vegetable sales on both the database and the Sepolia Testnet blockchain.

## Features

### 1. **Create Transaction Button**
- Appears in the AI Dashboard after analyzing a vegetable image
- Located next to the "Analyze Another Vegetable" button
- Opens a modal dialog to collect transaction details

### 2. **Transaction Modal Form**
The form collects the following information:

#### Auto-filled Fields (Read-only):
- **Farmer ID**: Automatically filled from user profile (or generated if not logged in)
- **Produce Name**: Auto-detected from AI analysis (currently defaults to "Tomato")
- **AI Grade**: Automatically filled from the analysis result (A, B, C, or Rotten)

#### User Input Fields (Required):
- **Quantity**: Amount of produce in kilograms (decimal input, e.g., 25.5 kg)
- **Price**: Price per unit in Indian Rupees (₹)
- **Status**: Transaction status (Pending, Verified, or Completed) - defaults to "Verified"

#### Display Fields:
- **Total Amount**: Automatically calculated as (Quantity × Price)
- **Blockchain Info**: Indicates that the transaction will be recorded on Sepolia Testnet

### 3. **Blockchain Integration**
When you submit a transaction:

1. **Database Recording**: 
   - Transaction is saved to the `transactions` table in PostgreSQL
   - Fields stored: farmer_id, produce_name, quantity, ai_grade, price, status, created_at

2. **Ledger Creation**:
   - An immutable ledger entry is created with all transaction data
   - Ledger includes: hash, previous_hash, timestamp, and data (JSONB)

3. **Blockchain Anchoring**:
   - The ledger hash is sent to the Sepolia Testnet
   - Smart contract method: `storeHash(id, hashValue, farmerName)`
   - Returns: Transaction hash and block number

4. **Final Result**:
   - Transaction ID (database)
   - Ledger Entry ID
   - Ledger Hash (64-character hex string)
   - Blockchain Transaction Hash (for verification on Sepolia explorer)

## Configuration

### Prerequisites
Before using the transaction feature, ensure the following are configured:

#### 1. PostgreSQL Database
```sql
-- Run the migrations to create/update tables:
-- 1. BlockchainLedger/database/migrations/001_initial_schema.sql
-- 2. BlockchainLedger/database/migrations/002_after_integration.sql

-- Tables created:
-- - ledger (for blockchain ledger with immutability triggers)
-- - transactions (for transaction records)
-- - farmers (for farmer information)
```

#### 2. Sepolia Testnet Configuration
Update `BlockchainLedger/backend/.env`:

```env
# Required: Sepolia RPC Endpoint (get from Infura, Alchemy, or similar)
SEPOLIA_RPC=https://sepolia.infura.io/v3/YOUR_INFURA_KEY

# Required: Private Key of your wallet (with test ETH for gas fees)
PRIVATE_KEY=0x... (32-byte hex string starting with 0x)

# Required: Your deployed smart contract address on Sepolia
CONTRACT_ADDRESS=0x... (20-byte hex address)
```

#### 3. Smart Contract Setup
Deploy a contract with the following function on Sepolia Testnet:

```solidity
contract VegeGradeHashStore {
    function storeHash(
        uint256 id,
        string memory hashValue,
        string memory farmerName
    ) public {
        // Implementation to store hash on blockchain
    }
}
```

#### 4. Service URLs (Gateway)
Ensure the gateway can reach all services. Update `.env` or check `Gateway/gateway.js`:

```javascript
const SERVICES = {
    AUTH: 'http://localhost:5000',      // Backend Auth Service
    ML: 'http://localhost:5001',        // ML Service
    PRICE: 'http://localhost:3001',     // Price API Service
    BLOCKCHAIN: 'http://localhost:3000' // Blockchain Ledger Service
};
```

## Testing the Feature

### Step 1: Start All Services
```bash
# Terminal 1: Database
# Ensure PostgreSQL is running
psql -U postgres

# Terminal 2: Blockchain Service
cd BlockchainLedger/backend
npm install
npm start

# Terminal 3: Gateway
cd Gateway
npm install
npm start

# Terminal 4: ML Service
cd BackEnd
npm install
npm start
```

### Step 2: Use the Dashboard
1. Open browser: `http://localhost:4000/` (adjust port as needed)
2. Navigate to the AI Dashboard
3. Upload a vegetable image
4. Click "Analyze with AI"
5. After results appear, click "Create Transaction" button

### Step 3: Fill the Form
- Quantity: Enter the weight in kg (e.g., 50.75)
- Price: Enter the price per kg in ₹ (e.g., 45.50)
- Status: Select status (default is "Verified")
- Click "Create Transaction"

### Step 4: Verify Results
Success message will show:
- Transaction ID
- Ledger Entry ID
- Ledger Hash
- Blockchain Transaction Hash

## API Endpoints

### Create Transaction
```
POST /api/blockchain/transactions

Request Body:
{
  "farmer_id": "F123456789",
  "produce_name": "Tomato",
  "quantity": 50.75,
  "ai_grade": "A",
  "price": 45.50,
  "status": "verified"
}

Response:
{
  "transaction": {
    "id": 1,
    "farmer_id": "F123456789",
    "produce_name": "Tomato",
    "quantity": 50.75,
    "ai_grade": "A",
    "price": 45.50,
    "total_amount": 2309.13,
    "ledger_entry_id": 1,
    "status": "verified",
    "created_at": "2024-..."
  },
  "ledger_entry_id": 1,
  "hash": "abc123def456...",
  "blockchain_tx_hash": "0x...",
  "block_number": 5123456
}
```

### Get Transaction History
```
GET /api/blockchain/transactions?farmerId=F123456789

Response:
{
  "transactions": [
    {
      "id": 1,
      "farmer_id": "F123456789",
      ...
      "ledger_hash": "abc123def456..."
    }
  ]
}
```

## Troubleshooting

### Error: "Not authenticated"
- The feature supports both authenticated (session) and direct farmer_id requests
- Ensure `farmer_id` is provided in the request body

### Error: "Service unavailable"
- Check if the blockchain service is running on the configured port
- Verify all microservices are started

### Error: "Missing required fields"
- Ensure quantity and price are entered in the modal form
- Both fields must be positive numbers

### Blockchain transaction fails
1. Check .env file has valid SEPOLIA_RPC and PRIVATE_KEY
2. Ensure wallet has sufficient test ETH for gas fees
3. Verify CONTRACT_ADDRESS is deployed on Sepolia
4. Check browser console for detailed error logs

### Database errors
1. Ensure PostgreSQL is running locally (localhost:5432)
2. Verify table schema is created by running migrations
3. Check database credentials in .env

## Database Schema

### Transactions Table
```sql
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    farmer_id VARCHAR(50) REFERENCES farmers(id),
    produce_name VARCHAR(100) NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL,
    ai_grade VARCHAR(10) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    total_amount DECIMAL(12, 2) GENERATED ALWAYS AS (quantity * price) STORED,
    ledger_entry_id BIGINT REFERENCES ledger(id),
    status VARCHAR(20) DEFAULT 'verified',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Ledger Table (Immutable Blockchain History)
```sql
CREATE TABLE ledger (
    id BIGSERIAL PRIMARY KEY,
    data JSONB NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    previous_hash VARCHAR(64),
    hash VARCHAR(64) NOT NULL UNIQUE,
    blockchain_tx_hash VARCHAR(66),
    block_number BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Security Considerations

1. **Private Key Management**: 
   - Never commit private keys to version control
   - Use environment variables or secure vault
   - Rotate keys regularly

2. **Frontend Validation**:
   - All form inputs are validated before submission
   - Farmer ID should be obtained from authenticated session in production

3. **Database Immutability**:
   - Ledger entries are protected by triggers (cannot be updated/deleted)
   - All changes are permanent and traceable

4. **Blockchain Verification**:
   - Transactions are anchored to Sepolia Testnet
   - Can be verified on Sepolia Etherscan with transaction hash

## Future Enhancements

1. **Multi-image Analysis**: Support analyzing multiple vegetables in one transaction
2. **Batch Transactions**: Create multiple transactions with one blockchain anchor
3. **Real Blockchain Network**: Migrate from Sepolia testnet to mainnet
4. **Smart Contracts**: Advanced contract logic for automated payments/escrow
5. **Verification UI**: Dashboard to verify transactions on blockchain
6. **Real-time Updates**: WebSocket for blockchain confirmation updates

## Support & Debugging

### Enable Debug Logging
```javascript
// In frontend (AIIndex.js)
console.log('Transaction Data:', transactionData);

// In backend (transaction.controller.js)
console.error('Transaction creation error:', error);
```

### Check Blockchain Confirmation
Visit Sepolia Etherscan: `https://sepolia.etherscan.io/tx/{txHash}`

### Verify Ledger Integrity
```sql
SELECT * FROM ledger ORDER BY id DESC LIMIT 10;
SELECT COUNT(*) FROM transactions;
```

---

**Version**: 1.0  
**Last Updated**: March 2, 2026  
**Author**: VEGEGRADE Development Team
