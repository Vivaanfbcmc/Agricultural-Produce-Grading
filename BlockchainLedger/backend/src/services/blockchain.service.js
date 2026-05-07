import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC);

const wallet = new ethers.Wallet(
    process.env.PRIVATE_KEY,
    provider
);

// ================= CONTRACT ABI =================

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

// ================= CONTRACT =================

const contract = new ethers.Contract(
    process.env.CONTRACT_ADDRESS,
    contractABI,
    wallet
);

// ================= BLOCKCHAIN SERVICE =================

class BlockchainService {

  // Generate UNIQUE blockchain ID every time
  static generateUniqueBlockchainId() {

    // timestamp + random number
    return Number(
        `${Date.now()}${Math.floor(Math.random() * 1000)}`
    );
  }

  // Check if record exists
  static async recordExists(id) {
    try {
      const record = await contract.records(id);
      return record.exists === true;
    } catch (err) {
      console.warn("Existence check failed:", err.message);
      return false;
    }
  }

  // Store hash on blockchain
  static async anchorLedger(hash, farmerName) {

    try {

      // ================= UNIQUE ID =================
      let blockchainId;
      let exists = true;

      // Keep generating until unique
      while (exists) {

        blockchainId = this.generateUniqueBlockchainId();

        exists = await this.recordExists(blockchainId);
      }

      console.log("=================================");
      console.log("ANCHORING TO BLOCKCHAIN");
      console.log("Blockchain ID:", blockchainId);
      console.log("Farmer:", farmerName);
      console.log("=================================");

      // Send transaction
      const tx = await contract.storeHash(
          blockchainId,
          hash,
          farmerName
      );

      console.log("Transaction sent:", tx.hash);

      // Wait for confirmation
      const receipt = await tx.wait();

      console.log("Transaction confirmed!");
      console.log("Block Number:", receipt.blockNumber);

      return {
        success: true,
        blockchain_id: blockchainId,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        from: receipt.from,
        to: receipt.to,
        gasUsed: receipt.gasUsed.toString()
      };

    } catch (err) {

      console.error("BLOCKCHAIN ERROR:");
      console.error(err);

      throw new Error(
          `Failed to anchor ledger: ${err.message}`
      );
    }
  }

  // Verify hash
  static async verifyHashOnChain(id, hash) {

    try {

      return await contract.verifyHash(id, hash);

    } catch (err) {

      console.error("Verification error:", err.message);

      throw new Error(
          `Failed to verify hash: ${err.message}`
      );
    }
  }

  // Get full record
  static async getRecordFromChain(id) {

    try {

      const [hashValue, timestamp, farmerName] =
          await contract.getRecord(id);

      return {
        id,
        hashValue,
        timestamp: timestamp.toString(),
        farmerName
      };

    } catch (err) {

      console.error("Fetch error:", err.message);

      throw new Error(
          `Failed to fetch record: ${err.message}`
      );
    }
  }

  // Get hash only
  static async getHashFromChain(id) {

    try {

      return await contract.getHash(id);

    } catch (err) {

      throw new Error(
          `Failed to fetch hash: ${err.message}`
      );
    }
  }

  // Contract owner
  static async getContractOwner() {

    try {

      return await contract.owner();

    } catch (err) {

      throw new Error(
          `Failed to fetch owner: ${err.message}`
      );
    }
  }
}

export default BlockchainService;