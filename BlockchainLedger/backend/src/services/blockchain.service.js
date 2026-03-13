import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// Full Contract ABI for VegetableHash
const contractABI = [
  {
    "inputs": [],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "id", "type": "uint256" },
      { "indexed": false, "name": "hashValue", "type": "string" },
      { "indexed": false, "name": "timestamp", "type": "uint256" }
    ],
    "name": "HashStored",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{ "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "name": "", "type": "uint256" }],
    "name": "records",
    "outputs": [
      { "name": "hashValue", "type": "string" },
      { "name": "timestamp", "type": "uint256" },
      { "name": "farmerName", "type": "string" },
      { "name": "exists", "type": "bool" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "id", "type": "uint256" },
      { "name": "hashValue", "type": "string" },
      { "name": "farmerName", "type": "string" }
    ],
    "name": "storeHash",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "name": "id", "type": "uint256" }],
    "name": "getHash",
    "outputs": [{ "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "name": "id", "type": "uint256" }],
    "name": "getRecord",
    "outputs": [
      { "name": "hashValue", "type": "string" },
      { "name": "timestamp", "type": "uint256" },
      { "name": "farmerName", "type": "string" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "id", "type": "uint256" },
      { "name": "hashToCheck", "type": "string" }
    ],
    "name": "verifyHash",
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  }
];

const contract = new ethers.Contract(
  process.env.CONTRACT_ADDRESS,
  contractABI,
  wallet
);

class BlockchainService {

  // ── Check if a record ID already exists on-chain ──────────────────────
  static async recordExists(id) {
    try {
      const record = await contract.records(id);
      return record.exists === true;
    } catch (err) {
      console.warn(`Could not check record existence for ID ${id}:`, err.message);
      return false;
    }
  }

  // ── Anchor ledger entry to Sepolia ────────────────────────────────────
  static async anchorLedger(id, hash, farmerName) {
    try {
      // Guard: skip if this ID is already anchored on-chain
      const exists = await BlockchainService.recordExists(id);
      if (exists) {
        console.warn(`Record ID ${id} already exists on-chain. Skipping anchor.`);
        return { skipped: true, reason: 'already_anchored' };
      }

      console.log(`Anchoring to Sepolia: ID=${id}, Farmer=${farmerName}`);

      const tx = await contract.storeHash(id, hash, farmerName);
      console.log(`Transaction sent: ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(`Confirmed in block: ${receipt.blockNumber}`);

      return {
        skipped: false,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        from: receipt.from,
        to: receipt.to,
        gasUsed: receipt.gasUsed.toString()
      };

    } catch (err) {
      console.error('Blockchain anchoring error:', err.message);
      throw new Error(`Failed to anchor to Sepolia: ${err.message}`);
    }
  }

  // Alias for backward compatibility
  static async sendToSepolia(id, hash, farmerName) {
    return this.anchorLedger(id, hash, farmerName);
  }

  // Verify hash stored on blockchain
  static async verifyHashOnChain(id, hash) {
    try {
      const isValid = await contract.verifyHash(id, hash);
      return isValid;
    } catch (err) {
      console.error('Verification error:', err.message);
      throw new Error(`Failed to verify hash: ${err.message}`);
    }
  }

  // Retrieve full record from blockchain
  static async getRecordFromChain(id) {
    try {
      const [hashValue, timestamp, farmerName] = await contract.getRecord(id);
      return {
        hashValue,
        timestamp: timestamp.toString(),
        farmerName,
        id
      };
    } catch (err) {
      console.error('Fetch error:', err.message);
      throw new Error(`Failed to fetch record: ${err.message}`);
    }
  }

  // Get just the hash
  static async getHashFromChain(id) {
    try {
      return await contract.getHash(id);
    } catch (err) {
      throw new Error(`Failed to fetch hash: ${err.message}`);
    }
  }

  // Get contract owner (who deployed it)
  static async getContractOwner() {
    try {
      return await contract.owner();
    } catch (err) {
      throw new Error(`Failed to fetch owner: ${err.message}`);
    }
  }
}

export default BlockchainService;