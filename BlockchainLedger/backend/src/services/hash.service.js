import crypto from 'crypto';

class HashService {
  static computeHash(data, timestamp, previousHash) {
    const input = JSON.stringify(data) + timestamp + (previousHash || '');
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  static verifyHash(data, timestamp, previousHash, storedHash) {
    const computed = this.computeHash(data, timestamp, previousHash);
    return computed === storedHash;
  }
}

export default HashService;
