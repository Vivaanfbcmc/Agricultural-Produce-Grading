// ═══════════════════════════════════════════════════════
//  API ENDPOINTS
// ═══════════════════════════════════════════════════════
const ML_API_URL    = "http://localhost:5001/analyze";   // Python ML model
const PRICE_API_URL = "http://localhost:3002/price";     // Node price guesser
const COMMODITY_ID  = 23;                                // Tomato ID on CEDA

// ═══════════════════════════════════════════════════════
//  DOM Elements
// ═══════════════════════════════════════════════════════
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

// Current state
let currentImage = null;

// Track analysis results for transaction modal
let analysisResults = {
    grade: '',
    price: 0,
    produceName: 'Tomato'
};

// ═══════════════════════════════════════════════════════
//  DRAG AND DROP
// ═══════════════════════════════════════════════════════
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
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
    reader.onload = function(e) {
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
//  Step 1 → ML API  (port 5001) → grade
//  Step 2 → Price API (port 3002) → smart price
// ═══════════════════════════════════════════════════════
async function analyzeImage() {
    if (!currentImage) return;

    loading.style.display       = 'block';
    analyzeBtn.disabled         = true;
    resultSection.style.display = 'none';

    try {
        // ── STEP 1: Send image to ML model ──────────────────
        console.log('[AI] Sending image to ML API →', ML_API_URL);
        const formData = new FormData();
        formData.append("image", currentImage);

        const mlRes = await fetch(ML_API_URL, {
            method: 'POST',
            body:   formData
        });

        if (!mlRes.ok) throw new Error(`ML service error: ${mlRes.status}`);

        const mlJson = await mlRes.json();
        console.log('[AI] ML response →', mlJson);

        if (!mlJson.success) throw new Error(mlJson.message || "ML model failed");

        // Normalise grade
        let grade = (mlJson.grade || "rotten").toUpperCase();
        if (grade === "D") grade = "ROTTEN";

        gradeValue.textContent = grade;
        console.log('[AI] Grade detected →', grade, '| Confidence →', mlJson.confidence, '%');

        // ── STEP 2: Get smart price from price guesser ───────
        priceValue.textContent = "Fetching market price...";

        if (grade === "ROTTEN") {
            // Rotten — no price needed
            console.log('[AI] Grade is ROTTEN — skipping price fetch');
            priceValue.textContent = "₹0 — Rejected (Rotten)";
            analysisResults.price  = 0;

        } else {
            console.log('[AI] Fetching price from →', PRICE_API_URL);

            const priceRes = await fetch(PRICE_API_URL, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    commodity_id: COMMODITY_ID,
                    grade
                })
            });

            const priceJson = await priceRes.json();
            console.log('[AI] Price API response →', priceJson);

            if (priceJson.success && typeof priceJson.price === 'number') {
                const formatted = new Intl.NumberFormat('en-IN', {
                    style:    'currency',
                    currency: 'INR'
                }).format(priceJson.price);

                priceValue.textContent = `${formatted} per quintal (Grade ${grade})`;
                analysisResults.price  = priceJson.price;

                // Save for transaction modal
                localStorage.setItem('lastMarketPrice', priceJson.price);

                console.log('[AI] ✅ Price →', formatted, '| Records used →', priceJson.records_used);
            } else {
                priceValue.textContent = "Price not available for this grade.";
                console.warn('[AI] Price fetch failed →', priceJson.message);
            }
        }

        // ── Show results ─────────────────────────────────────
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
//  ANALYSIS DETAILS PER GRADE
// ═══════════════════════════════════════════════════════
function generateAnalysisDetails(grade) {
    analysisDetails.innerHTML = '';

    const detailsMap = {
        'A': [
            { label: 'Freshness',         value: 'Excellent',          color: '#059669' },
            { label: 'Color',             value: 'Vibrant & Uniform',  color: '#059669' },
            { label: 'Texture',           value: 'Firm & Crisp',       color: '#059669' },
            { label: 'Size Consistency',  value: 'Highly Consistent',  color: '#059669' },
            { label: 'Defects',           value: 'Minimal to None',    color: '#059669' }
        ],
        'B': [
            { label: 'Freshness',         value: 'Good',                       color: '#f59e0b' },
            { label: 'Color',             value: 'Slightly Faded',             color: '#f59e0b' },
            { label: 'Texture',           value: 'Mostly Firm',                color: '#f59e0b' },
            { label: 'Size Consistency',  value: 'Moderately Consistent',      color: '#f59e0b' },
            { label: 'Defects',           value: 'Minor Blemishes',            color: '#f59e0b' }
        ],
        'C': [
            { label: 'Freshness',         value: 'Average',             color: '#f97316' },
            { label: 'Color',             value: 'Noticeably Faded',    color: '#f97316' },
            { label: 'Texture',           value: 'Some Soft Spots',     color: '#f97316' },
            { label: 'Size Consistency',  value: 'Inconsistent',        color: '#f97316' },
            { label: 'Defects',           value: 'Visible Blemishes',   color: '#f97316' }
        ],
        'ROTTEN': [
            { label: 'Freshness',         value: 'Poor',                  color: '#dc2626' },
            { label: 'Color',             value: 'Dull & Discolored',     color: '#dc2626' },
            { label: 'Texture',           value: 'Soft & Wilted',         color: '#dc2626' },
            { label: 'Size Consistency',  value: 'Highly Inconsistent',   color: '#dc2626' },
            { label: 'Defects',           value: 'Significant Damage',    color: '#dc2626' }
        ]
    };

    const details = detailsMap[grade] || detailsMap['B'];
    details.forEach(detail => {
        const li   = document.createElement('li');
        li.innerHTML = `<strong>${detail.label}:</strong> <span style="color:${detail.color}">${detail.value}</span>`;
        analysisDetails.appendChild(li);
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
    console.log('[AI] VEGEGRADE AI ready.');
    initializeTransactionModal();
});

// ═══════════════════════════════════════════════════════
//  TRANSACTION MODAL
// ═══════════════════════════════════════════════════════
function initializeTransactionModal() {
    const farmerId = localStorage.getItem('farmerId') || 'F' + Date.now();
    document.getElementById('farmerId').value = farmerId;

    const savedPrice = localStorage.getItem('lastMarketPrice');
    if (savedPrice) document.getElementById('price').value = savedPrice;

    document.getElementById('quantity').addEventListener('change', calculateTotal);
    document.getElementById('price').addEventListener('change', calculateTotal);
}

function calculateTotal() {
    const quantity = parseFloat(document.getElementById('quantity').value) || 0;
    const price    = parseFloat(document.getElementById('price').value)    || 0;
    document.getElementById('totalAmount').textContent = `₹${(quantity * price).toFixed(2)}`;
}

function openTransactionModal() {
    const modal = document.getElementById('transactionModal');
    const grade = gradeValue.textContent;
    const price = analysisResults.price || 0;

    document.getElementById('aiGrade').value    = grade;
    document.getElementById('produceName').value = analysisResults.produceName;

    if (price > 0) {
        document.getElementById('price').value = price;
        calculateTotal();
    }

    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeTransactionModal() {
    document.getElementById('transactionModal').classList.remove('show');
    document.body.style.overflow = 'auto';
    document.getElementById('transactionForm').reset();
    document.getElementById('errorMessage').style.display = 'none';
}

async function submitTransaction() {
    const farmerId    = document.getElementById('farmerId').value;
    const produceName = document.getElementById('produceName').value;
    const quantity    = parseFloat(document.getElementById('quantity').value);
    const aiGrade     = document.getElementById('aiGrade').value;
    const price       = parseFloat(document.getElementById('price').value);
    const status      = document.getElementById('status').value;

    if (!quantity || quantity <= 0) { showError('Please enter a valid quantity'); return; }
    if (!price    || price    <= 0) { showError('Please enter a valid price');    return; }

    document.getElementById('submitTransactionBtn').disabled  = true;
    document.getElementById('loadingModal').style.display     = 'block';
    document.getElementById('errorMessage').style.display     = 'none';

    try {
        const transactionData = { farmer_id: farmerId, produce_name: produceName, quantity, ai_grade: aiGrade, price, status };
        console.log('[TX] Submitting transaction →', transactionData);

        const response = await fetch('/api/blockchain/transactions', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(transactionData)
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to create transaction');

        showSuccess(result);

    } catch (err) {
        console.error('[TX] Transaction error →', err);
        showError(err.message || 'Error creating transaction. Please try again.');
    } finally {
        document.getElementById('submitTransactionBtn').disabled = false;
        document.getElementById('loadingModal').style.display    = 'none';
    }
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent    = '❌ Error: ' + message;
    errorDiv.style.display  = 'block';
    errorDiv.scrollIntoView({ behavior: 'smooth' });
}

function showSuccess(result) {
    alert(
        'Transaction Created Successfully!\n\n' +
        'Transaction ID: '  + (result.transaction?.id  || 'N/A') + '\n' +
        'Ledger Entry ID: ' + result.ledger_entry_id              + '\n' +
        'Hash: '            + (result.hash?.substring(0, 16) || 'N/A') + '...\n\n' +
        'Your transaction has been recorded in the ledger.'
    );

    saveTransactionToHistory(result);
    closeTransactionModal();
    localStorage.setItem('lastMarketPrice', document.getElementById('price').value);
}

function saveTransactionToHistory(result) {
    const history = JSON.parse(localStorage.getItem('vegegrade_history') || '[]');

    history.unshift({
        date:            new Date().toISOString(),
        item:            document.getElementById('produceName').value,
        quantity:        document.getElementById('quantity').value + ' kg',
        price:           parseFloat(document.getElementById('price').value),
        buyer:           result.transaction?.buyer_name || 'Market Sale',
        total:           parseFloat(document.getElementById('quantity').value) * parseFloat(document.getElementById('price').value),
        transactionId:   result.transaction?.id || 'N/A',
        grade:           document.getElementById('aiGrade').value,
        blockchainHash:  (result.hash?.substring(0, 16) || 'N/A') + '...'
    });

    localStorage.setItem('vegegrade_history', JSON.stringify(history));
    console.log('[TX] Saved to history');
}