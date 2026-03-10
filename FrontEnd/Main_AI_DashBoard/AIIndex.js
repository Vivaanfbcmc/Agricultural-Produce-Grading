// ═══════════════════════════════════════════════════════
//  VEGEGRADE — AI Assessment Logic
//
//  All calls go through the GATEWAY (relative URLs):
//  POST /api/ml/analyze          → ML grading service
//  POST /api/price               → Price service
//  POST /api/transactions        → Blockchain ledger (port 3000)
//  GET  /api/transactions        → Fetch history
//  GET  /api/auth/profile        → Auth / farmer ID
// ═══════════════════════════════════════════════════════

// ── CONFIG ─────────────────────────────────────────────
const DEFAULT_STATE     = 'Maharashtra';
const DEFAULT_DISTRICT  = 'Sholapur';
const DEFAULT_COMMODITY = 'Tomato';

// ── STATE ──────────────────────────────────────────────
let currentImage    = null;
let analysisResults = { grade: '', price: '', produceName: 'Tomato' };

// ── DOM REFERENCES ─────────────────────────────────────
const uploadArea       = document.getElementById('uploadArea');
const fileInput        = document.getElementById('fileInput');
const previewContainer = document.getElementById('previewContainer');
const previewImage     = document.getElementById('previewImage');
const fileName         = document.getElementById('fileName');
const fileSize         = document.getElementById('fileSize');
const fileDimensions   = document.getElementById('fileDimensions');
const analyzeBtn       = document.getElementById('analyzeBtn');
const loading          = document.getElementById('loading');
const resultSection    = document.getElementById('resultSection');
const resultImage      = document.getElementById('resultImage');
const gradeValue       = document.getElementById('gradeValue');
const priceValue       = document.getElementById('priceValue');
const analysisDetails  = document.getElementById('analysisDetails');

// ═══════════════════════════════════════════════════════
//  DRAG AND DROP
// ═══════════════════════════════════════════════════════
uploadArea.addEventListener('dragover', e => {
  e.preventDefault();
  uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', e => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  if (e.dataTransfer.files.length) {
    handleFileSelect({ target: { files: e.dataTransfer.files } });
  }
});

// ═══════════════════════════════════════════════════════
//  FILE SELECTION
// ═══════════════════════════════════════════════════════
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file || !file.type.startsWith('image/')) {
    alert('Please select a valid image file (JPG, PNG, WebP).');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert('File size should be less than 5MB.');
    return;
  }

  currentImage = file;
  fileName.textContent = file.name;
  fileSize.textContent = formatFileSize(file.size);

  const reader = new FileReader();
  reader.onload = e => {
    previewImage.src = e.target.result;
    resultImage.src  = e.target.result;
    const img    = new Image();
    img.onload   = () => { fileDimensions.textContent = `${img.width} × ${img.height}px`; };
    img.src      = e.target.result;
  };
  reader.readAsDataURL(file);

  previewContainer.style.display = 'block';
  analyzeBtn.disabled = false;
}

function formatFileSize(bytes) {
  if (bytes < 1024)    return bytes + ' bytes';
  if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

// ═══════════════════════════════════════════════════════
//  MAIN ANALYSIS FLOW
//  Step 1 → /api/ml/analyze      → grade
//  Step 2 → /api/price           → market price
// ═══════════════════════════════════════════════════════
async function analyzeImage() {
  if (!currentImage) return;

  loading.style.display       = 'block';
  analyzeBtn.disabled         = true;
  resultSection.style.display = 'none';

  try {
    // ── STEP 1: ML Grade ────────────────────────────────
    const formData = new FormData();
    formData.append('image', currentImage);

    const mlRes = await fetch('/api/ml/analyze', {
      method: 'POST',
      body:   formData
    });

    if (!mlRes.ok) throw new Error(`ML service error: ${mlRes.status}`);

    const mlJson = await mlRes.json();
    console.log('[AI] ML response →', mlJson);

    let grade = mlJson.grade || 'Rotten';
    if (grade.toUpperCase() === 'D') grade = 'ROTTEN';
    grade = grade.toUpperCase();

    gradeValue.textContent = grade;

    // Style grade badge
    const badge = document.getElementById('gradeBadge');
    if (badge) {
      badge.className = 'grade-badge';
      if (grade === 'ROTTEN') badge.classList.add('rotten');
      else if (grade === 'B') badge.classList.add('grade-b');
      else if (grade === 'C') badge.classList.add('grade-c');
    }

    // ── STEP 2: Market Price ────────────────────────────
    priceValue.textContent = 'Fetching market price…';

    const priceRes = await fetch('/api/price', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        state:     DEFAULT_STATE,
        district:  DEFAULT_DISTRICT,
        commodity: DEFAULT_COMMODITY,
        grade
      })
    });

    const priceJson = await priceRes.json();
    console.log('[AI] Price response →', priceJson);

    if (priceJson.success && typeof priceJson.selectedPrice === 'number') {
      const formatted = new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: 'INR'
      }).format(priceJson.selectedPrice);
      priceValue.textContent = `${formatted} per unit (Grade ${grade})`;
      analysisResults.price  = String(priceJson.selectedPrice);
      localStorage.setItem('lastMarketPrice', priceJson.selectedPrice);
    } else {
      priceValue.textContent = 'Price not available for this grade.';
      analysisResults.price  = '';
    }

    analysisResults.grade = grade;
    generateAnalysisDetails(grade);
    resultSection.style.display = 'block';
    resultSection.scrollIntoView({ behavior: 'smooth' });

  } catch (err) {
    console.error('[AI] Analysis error →', err);
    alert(`Error: ${err.message}`);
  } finally {
    loading.style.display = 'none';
    analyzeBtn.disabled   = false;
  }
}

// ═══════════════════════════════════════════════════════
//  ANALYSIS DETAILS TABLE
// ═══════════════════════════════════════════════════════
function generateAnalysisDetails(grade) {
  analysisDetails.innerHTML = '';

  const detailsMap = {
    'A': [
      { label: 'Freshness',        value: 'Excellent',          color: '#059669' },
      { label: 'Color',            value: 'Vibrant & Uniform',  color: '#059669' },
      { label: 'Texture',          value: 'Firm & Crisp',       color: '#059669' },
      { label: 'Size Consistency', value: 'Highly Consistent',  color: '#059669' },
      { label: 'Defects',          value: 'Minimal to None',    color: '#059669' },
    ],
    'B': [
      { label: 'Freshness',        value: 'Good',                   color: '#f59e0b' },
      { label: 'Color',            value: 'Slightly Faded',          color: '#f59e0b' },
      { label: 'Texture',          value: 'Mostly Firm',             color: '#f59e0b' },
      { label: 'Size Consistency', value: 'Moderately Consistent',   color: '#f59e0b' },
      { label: 'Defects',          value: 'Minor Blemishes',         color: '#f59e0b' },
    ],
    'C': [
      { label: 'Freshness',        value: 'Average',            color: '#f97316' },
      { label: 'Color',            value: 'Noticeably Faded',   color: '#f97316' },
      { label: 'Texture',          value: 'Some Soft Spots',    color: '#f97316' },
      { label: 'Size Consistency', value: 'Inconsistent',       color: '#f97316' },
      { label: 'Defects',          value: 'Visible Blemishes',  color: '#f97316' },
    ],
    'ROTTEN': [
      { label: 'Freshness',        value: 'Poor',                color: '#dc2626' },
      { label: 'Color',            value: 'Dull & Discolored',   color: '#dc2626' },
      { label: 'Texture',          value: 'Soft & Wilted',       color: '#dc2626' },
      { label: 'Size Consistency', value: 'Highly Inconsistent', color: '#dc2626' },
      { label: 'Defects',          value: 'Significant Damage',  color: '#dc2626' },
    ],
  };

  const gradeDetails = detailsMap[grade] || detailsMap['B'];

  // Support both <li> list (old HTML) and <tr> table (new government HTML)
  const tbody = document.getElementById('analysisDetails');
  const isTable = tbody && tbody.tagName === 'TBODY';

  gradeDetails.forEach(detail => {
    if (isTable) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${detail.label}</strong></td>
        <td style="color:${detail.color}">${detail.value}</td>
        <td><span class="status-pill" style="background:${detail.color}22; color:${detail.color}; padding:3px 10px; border-radius:20px; font-size:12px; font-weight:700;">${detail.value.split(' ')[0]}</span></td>
      `;
      tbody.appendChild(tr);
    } else {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${detail.label}:</strong> <span style="color:${detail.color}">${detail.value}</span>`;
      analysisDetails.appendChild(li);
    }
  });
}

// ═══════════════════════════════════════════════════════
//  RESET
// ═══════════════════════════════════════════════════════
function resetApp() {
  fileInput.value             = '';
  previewContainer.style.display = 'none';
  resultSection.style.display    = 'none';
  analyzeBtn.disabled            = true;
  previewImage.src               = '';
  resultImage.src                = '';
  currentImage                   = null;
  uploadArea.scrollIntoView({ behavior: 'smooth' });
}

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  console.log('[VEGEGRADE] Portal ready.');
  initializeTransactionModal();
});

// ═══════════════════════════════════════════════════════
//  TRANSACTION MODAL — INIT
//  Fetches real farmer ID from /api/auth/profile
// ═══════════════════════════════════════════════════════
async function initializeTransactionModal() {
  try {
    const res = await fetch('/api/auth/profile');
    if (res.ok) {
      const data = await res.json();
      if (data.user && data.user.farmerId) {
        localStorage.setItem('farmerId', data.user.farmerId);
        localStorage.setItem('farmerName', data.user.fullName || '');
      }
    }
  } catch (err) {
    console.warn('[INIT] Could not fetch profile for farmer ID:', err.message);
  }

  // Fallback: generate a local farmer ID if none found
  if (!localStorage.getItem('farmerId')) {
    localStorage.setItem('farmerId', 'F' + Date.now());
  }

  document.getElementById('quantity').addEventListener('input', calculateTotal);
  document.getElementById('price').addEventListener('input', calculateTotal);
}

// ═══════════════════════════════════════════════════════
//  TOTAL CALCULATION
// ═══════════════════════════════════════════════════════
function calculateTotal() {
  const quantity = parseFloat(document.getElementById('quantity').value) || 0;
  const price    = parseFloat(document.getElementById('price').value)    || 0;
  document.getElementById('totalAmount').textContent = `₹${(quantity * price).toFixed(2)}`;
}

// ═══════════════════════════════════════════════════════
//  OPEN TRANSACTION MODAL
//  Fetches fresh farmer ID from session each time
// ═══════════════════════════════════════════════════════
async function openTransactionModal() {
  const modal = document.getElementById('transactionModal');

  // Fetch fresh farmer ID from session
  let farmerId = localStorage.getItem('farmerId') || '';
  try {
    const res = await fetch('/api/auth/profile');
    if (res.ok) {
      const data = await res.json();
      if (data.user && data.user.farmerId) {
        farmerId = data.user.farmerId;
        localStorage.setItem('farmerId', farmerId);
      }
    }
  } catch (err) {
    console.warn('[MODAL] Could not fetch profile:', err.message);
  }

  document.getElementById('farmerId').value     = farmerId;
  document.getElementById('aiGrade').value      = gradeValue.textContent;
  document.getElementById('produceName').value  = analysisResults.produceName;

  // Auto-fill price from analysis result
  const priceMatch = priceValue.textContent.match(/[\d,.]+/);
  const price      = priceMatch ? priceMatch[0].replace(/,/g, '') : '';
  if (price) {
    document.getElementById('price').value = price;
    calculateTotal();
  }

  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
}

// ═══════════════════════════════════════════════════════
//  CLOSE TRANSACTION MODAL
// ═══════════════════════════════════════════════════════
function closeTransactionModal() {
  const modal = document.getElementById('transactionModal');
  modal.classList.remove('show');
  document.body.style.overflow = 'auto';

  // Reset form fields
  const form = document.getElementById('transactionForm');
  if (form) form.reset();
  document.getElementById('errorMessage').style.display = 'none';
}

// ═══════════════════════════════════════════════════════
//  SUBMIT TRANSACTION
//
//  ✅ CORRECT gateway route: POST /api/transactions
//     (gateway proxies this to blockchain backend on port 3000)
//
//  ❌ OLD WRONG route: /api/blockchain/transactions  → 404
// ═══════════════════════════════════════════════════════
async function submitTransaction() {
  const farmerId    = document.getElementById('farmerId').value;
  const produceName = document.getElementById('produceName').value;
  const quantity    = parseFloat(document.getElementById('quantity').value);
  const aiGrade     = document.getElementById('aiGrade').value;
  const price       = parseFloat(document.getElementById('price').value);
  const status      = document.getElementById('status').value;

  // Validation
  if (!quantity || quantity <= 0) { showError('Please enter a valid quantity.'); return; }
  if (!price    || price    <= 0) { showError('Please enter a valid price.');    return; }

  document.getElementById('submitTransactionBtn').disabled = true;
  document.getElementById('loadingModal').style.display    = 'block';
  document.getElementById('errorMessage').style.display   = 'none';

  const transactionData = {
    farmer_id:    farmerId,
    produce_name: produceName,
    quantity,
    ai_grade:     aiGrade,
    price,
    status
  };

  console.log('[TX] Submitting → /api/transactions', transactionData);

  try {
    // ✅ /api/transactions — correct gateway route
    const response = await fetch('/api/transactions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(transactionData)
    });

    // Safe parse — avoids "Unexpected token <" crash on HTML error pages
    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      throw new Error(`Server returned non-JSON (status ${response.status}). Check gateway is running.`);
    }

    if (!response.ok) {
      throw new Error(result.error || result.message || `Server error: ${response.status}`);
    }

    console.log('[TX] ✅ Success →', result);
    showSuccess(result);

  } catch (err) {
    console.error('[TX] Error →', err);
    showError(err.message || 'Error creating transaction. Please try again.');
  } finally {
    document.getElementById('submitTransactionBtn').disabled = false;
    document.getElementById('loadingModal').style.display    = 'none';
  }
}

// ═══════════════════════════════════════════════════════
//  SHOW ERROR / SUCCESS
// ═══════════════════════════════════════════════════════
function showError(message) {
  const errorDiv         = document.getElementById('errorMessage');
  errorDiv.textContent   = '❌ Error: ' + message;
  errorDiv.style.display = 'block';
  errorDiv.scrollIntoView({ behavior: 'smooth' });
}

function showSuccess(result) {
  alert(
    'Transaction Created Successfully!\n\n' +
    'Transaction ID:  ' + (result.transaction?.id  || 'N/A')                    + '\n' +
    'Ledger Entry ID: ' + (result.ledger_entry_id   || 'N/A')                   + '\n' +
    'Hash: '            + ((result.hash || '').substring(0, 16) || 'N/A') + '…' + '\n\n' +
    'Your transaction has been recorded in the ledger.'
  );

  saveTransactionToHistory(result);
  closeTransactionModal();
  localStorage.setItem('lastMarketPrice', document.getElementById('price').value);
}

// ═══════════════════════════════════════════════════════
//  SAVE TO LOCAL HISTORY
//  Field names match TransactionController.getTransactions()
//  so history.js works for both backend and local cache
// ═══════════════════════════════════════════════════════
function saveTransactionToHistory(result) {
  const history = JSON.parse(localStorage.getItem('vegegrade_history') || '[]');

  history.unshift({
    id:              result.transaction?.id      || 'N/A',
    farmer_id:       document.getElementById('farmerId').value,
    produce_name:    document.getElementById('produceName').value,
    quantity:        parseFloat(document.getElementById('quantity').value),
    price:           parseFloat(document.getElementById('price').value),
    total_amount:    parseFloat(document.getElementById('quantity').value) *
                     parseFloat(document.getElementById('price').value),
    ai_grade:        document.getElementById('aiGrade').value,
    status:          document.getElementById('status').value,
    created_at:      new Date().toISOString(),
    blockchain_hash: (result.hash || '').substring(0, 16) + '…',
    ledger_entry_id: result.ledger_entry_id || 'N/A',
  });

  localStorage.setItem('vegegrade_history', JSON.stringify(history));
  console.log('[TX] Saved to local history cache');
}