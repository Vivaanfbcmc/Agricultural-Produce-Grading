// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const previewContainer = document.getElementById('previewContainer');
const previewImage = document.getElementById('previewImage');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const fileDimensions = document.getElementById('fileDimensions');
const analyzeBtn = document.getElementById('analyzeBtn');
const loading = document.getElementById('loading');
const resultSection = document.getElementById('resultSection');
const resultImage = document.getElementById('resultImage');
const gradeValue = document.getElementById('gradeValue');
const priceValue = document.getElementById('priceValue');
const analysisDetails = document.getElementById('analysisDetails');

// Current state
let currentImage = null;

// CEDA commodity ID for Tomato
const DEFAULT_COMMODITY_ID = 23;

// ── DRAG & DROP ────────────────────────────────────────────────
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

// ── FILE SELECT ────────────────────────────────────────────────
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
    reader.onload = function (e) {
        previewImage.src = e.target.result;
        resultImage.src = e.target.result;

        const img = new Image();
        img.onload = function () {
            fileDimensions.textContent = `${img.width} × ${img.height}px`;
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);

    previewContainer.style.display = 'block';
    analyzeBtn.disabled = false;

    // Hide any previous not-a-tomato banner
    hideNotTomatoBanner();
    resultSection.style.display = 'none';
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
    else return (bytes / 1048576).toFixed(2) + ' MB';
}

// ── NOT-A-TOMATO BANNER ────────────────────────────────────────
function showNotTomatoBanner(detectedAs, confidence) {
    // Remove old banner if present
    hideNotTomatoBanner();

    const banner = document.createElement('div');
    banner.id = 'notTomatoBanner';
    banner.style.cssText = `
        background: #fff3cd;
        border: 1px solid #ffc107;
        border-left: 5px solid #e65100;
        border-radius: 6px;
        padding: 16px 20px;
        margin: 18px 0;
        display: flex;
        align-items: flex-start;
        gap: 14px;
        font-family: inherit;
        animation: fadeIn 0.3s ease;
    `;

    const detectedLabel = detectedAs && detectedAs !== 'unknown' && detectedAs !== 'detection_disabled'
        ? `Detected as: <strong>${detectedAs}</strong>`
        : 'Object not recognised as a tomato';

    const confText = confidence > 0
        ? ` (${confidence}% confidence)`
        : '';

    banner.innerHTML = `
        <span style="font-size:28px;line-height:1;">🍅</span>
        <div style="flex:1;">
            <div style="font-weight:700;font-size:15px;color:#b33000;margin-bottom:4px;">
                ⚠ Not a Tomato
            </div>
            <div style="font-size:13.5px;color:#5d4000;line-height:1.5;">
                ${detectedLabel}${confText}.<br>
                This system is trained to grade <strong>tomatoes only</strong>.
                Please upload a clear photo of a <strong>tomato</strong> and try again.
            </div>
            <button onclick="resetApp()" style="
                margin-top:10px;
                background:#e65100;color:white;
                border:none;border-radius:4px;
                padding:7px 16px;font-size:13px;font-weight:600;
                cursor:pointer;">
                📷 Upload a Tomato
            </button>
        </div>
    `;

    // Insert banner just before the result section (or after preview)
    const anchor = resultSection.parentNode;
    anchor.insertBefore(banner, resultSection);

    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideNotTomatoBanner() {
    const old = document.getElementById('notTomatoBanner');
    if (old) old.remove();
}

// ── MAIN ANALYZE FUNCTION ──────────────────────────────────────
async function analyzeImage() {
    if (!currentImage) return;

    loading.style.display = 'block';
    analyzeBtn.disabled = true;
    resultSection.style.display = 'none';
    hideNotTomatoBanner();

    analysisResults.price = '';

    try {
        // ── Step 1: ML service (tomato check + grade) ──
        const formData = new FormData();
        formData.append("image", currentImage);

        const mlRes = await fetch("/api/ml/analyze", {
            method: 'POST',
            body: formData
        });

        if (!mlRes.ok) {
            throw new Error(`ML service error: ${mlRes.status}`);
        }

        const mlJson = await mlRes.json();

        // ── Not a tomato? Show banner and stop. ────────
        if (mlJson.is_tomato === false) {
            showNotTomatoBanner(mlJson.detected_as, mlJson.detection_conf);
            return;   // don't show grade/price section
        }

        // ── Success: process grade ─────────────────────
        let grade = mlJson.grade || "Rotten";
        if (grade.toUpperCase() === "D") grade = "Rotten";
        grade = grade.toUpperCase();

        gradeValue.textContent = grade;
        analysisResults.grade  = grade;

        // ── Step 2: Fetch market price ─────────────────
        priceValue.textContent = "Fetching market price...";

        if (grade === 'ROTTEN') {
            priceValue.textContent = "₹0 — Rejected (rotten produce)";
            analysisResults.price  = '0';
        } else {
            try {
                const priceRes = await fetch("/api/ceda-price", {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        commodity_id: DEFAULT_COMMODITY_ID,
                        grade: grade
                    })
                });

                const priceJson = await priceRes.json();

                if (priceJson.success && typeof priceJson.price === 'number') {
                    analysisResults.price  = String(priceJson.price);
                    priceValue.textContent = `${priceJson.price_display} (Grade ${grade})`;
                } else {
                    priceValue.textContent = "Price not available for this grade.";
                    analysisResults.price  = '';
                }
            } catch (priceErr) {
                console.warn('CEDA price fetch failed:', priceErr);
                priceValue.textContent = "Price not available (service offline).";
                analysisResults.price  = '';
            }
        }

        generateAnalysisDetails(grade);
        resultSection.style.display = 'block';
        resultSection.scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
        console.error('Analysis error:', err);
        alert(`Error: ${err.message}`);
    } finally {
        loading.style.display  = 'none';
        analyzeBtn.disabled    = false;
    }
}

// ── ANALYSIS DETAILS ───────────────────────────────────────────
function generateAnalysisDetails(grade) {
    analysisDetails.innerHTML = '';

    const detailsMap = {
        'A': [
            { label: 'Freshness',         value: 'Excellent',            color: '#059669' },
            { label: 'Color',             value: 'Vibrant & Uniform',    color: '#059669' },
            { label: 'Texture',           value: 'Firm & Crisp',         color: '#059669' },
            { label: 'Size Consistency',  value: 'Highly Consistent',    color: '#059669' },
            { label: 'Defects',           value: 'Minimal to None',      color: '#059669' }
        ],
        'B': [
            { label: 'Freshness',         value: 'Good',                     color: '#f59e0b' },
            { label: 'Color',             value: 'Slightly Faded',           color: '#f59e0b' },
            { label: 'Texture',           value: 'Mostly Firm',              color: '#f59e0b' },
            { label: 'Size Consistency',  value: 'Moderately Consistent',    color: '#f59e0b' },
            { label: 'Defects',           value: 'Minor Blemishes',          color: '#f59e0b' }
        ],
        'C': [
            { label: 'Freshness',         value: 'Average',              color: '#f97316' },
            { label: 'Color',             value: 'Noticeably Faded',     color: '#f97316' },
            { label: 'Texture',           value: 'Some Soft Spots',      color: '#f97316' },
            { label: 'Size Consistency',  value: 'Inconsistent',         color: '#f97316' },
            { label: 'Defects',           value: 'Visible Blemishes',    color: '#f97316' }
        ],
        'ROTTEN': [
            { label: 'Freshness',         value: 'Poor',                 color: '#dc2626' },
            { label: 'Color',             value: 'Dull & Discolored',    color: '#dc2626' },
            { label: 'Texture',           value: 'Soft & Wilted',        color: '#dc2626' },
            { label: 'Size Consistency',  value: 'Highly Inconsistent',  color: '#dc2626' },
            { label: 'Defects',           value: 'Significant Damage',   color: '#dc2626' }
        ]
    };

    const gradeDetails = detailsMap[grade] || detailsMap['B'];
    gradeDetails.forEach(detail => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${detail.label}:</strong> <span style="color:${detail.color}">${detail.value}</span>`;
        analysisDetails.appendChild(li);
    });
}

// ── RESET ──────────────────────────────────────────────────────
function resetApp() {
    fileInput.value = '';
    previewContainer.style.display = 'none';
    resultSection.style.display    = 'none';
    analyzeBtn.disabled            = true;
    previewImage.src               = '';
    resultImage.src                = '';
    currentImage                   = null;
    analysisResults                = { grade: '', price: '', produceName: 'Tomato' };
    hideNotTomatoBanner();
    uploadArea.scrollIntoView({ behavior: 'smooth' });
}

// ── INIT ───────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    console.log('VEGEGRADE AI ready.');
    initializeTransactionModal();
});

// ── TRANSACTION MODAL ──────────────────────────────────────────
let analysisResults = { grade: '', price: '', produceName: 'Tomato' };

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
        console.warn('Could not fetch profile for farmer ID:', err);
    }

    document.getElementById('quantity').addEventListener('input', calculateTotal);
    document.getElementById('price').addEventListener('input', calculateTotal);
}

function calculateTotal() {
    const quantity = parseFloat(document.getElementById('quantity').value) || 0;
    const price    = parseFloat(document.getElementById('price').value)    || 0;
    document.getElementById('totalAmount').textContent = `₹${(quantity * price).toFixed(2)}`;
}

async function openTransactionModal() {
    const modal = document.getElementById('transactionModal');

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
        console.warn('Could not fetch profile:', err);
    }

    document.getElementById('farmerId').value    = farmerId;
    document.getElementById('aiGrade').value     = gradeValue.textContent;
    document.getElementById('produceName').value = analysisResults.produceName;
    analysisResults.grade = gradeValue.textContent;

    if (analysisResults.price) {
        document.getElementById('price').value = analysisResults.price;
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
    const farmerId   = document.getElementById('farmerId').value;
    const produceName = document.getElementById('produceName').value;
    const quantity   = parseFloat(document.getElementById('quantity').value);
    const aiGrade    = document.getElementById('aiGrade').value;
    const price      = parseFloat(document.getElementById('price').value);
    const status     = document.getElementById('status').value;

    if (!farmerId)             return showError('Farmer ID is missing. Please log in again.');
    if (!quantity || quantity <= 0) return showError('Please enter a valid quantity');
    if (!price    || price    <= 0) return showError('Please enter a valid price');

    document.getElementById('submitTransactionBtn').disabled = true;
    document.getElementById('loadingModal').style.display   = 'block';
    document.getElementById('errorMessage').style.display   = 'none';

    try {
        const response = await fetch('/api/blockchain/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                farmer_id:    farmerId,
                produce_name: produceName,
                quantity,
                ai_grade:     aiGrade,
                price,
                status
            })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to create transaction');

        showSuccess(result);
    } catch (err) {
        console.error('Transaction submission error:', err);
        showError(err.message || 'Error creating transaction. Please try again.');
    } finally {
        document.getElementById('submitTransactionBtn').disabled = false;
        document.getElementById('loadingModal').style.display   = 'none';
    }
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent   = '❌ Error: ' + message;
    errorDiv.style.display = 'block';
    errorDiv.scrollIntoView({ behavior: 'smooth' });
}

function showSuccess(result) {
    alert(
        'Transaction Created Successfully!\n\n' +
        'Transaction ID: '  + (result.transaction?.id || 'N/A') + '\n' +
        'Ledger Entry ID: ' + (result.ledger_entry_id  || 'N/A') + '\n' +
        'Hash: '            + (result.hash ? result.hash.substring(0, 16) + '...' : 'N/A') + '\n\n' +
        'Your transaction has been recorded in the ledger.'
    );
    saveTransactionToHistory(result);
    closeTransactionModal();
    localStorage.setItem('lastMarketPrice', document.getElementById('price').value);
}

function saveTransactionToHistory(result) {
    const farmerId   = localStorage.getItem('farmerId') || 'guest';
    const historyKey = 'vegegrade_history_' + farmerId;
    const history    = JSON.parse(localStorage.getItem(historyKey) || '[]');

    const qty = parseFloat(document.getElementById('quantity').value) || 0;
    const prc = parseFloat(document.getElementById('price').value)    || 0;

    history.unshift({
        date:            new Date().toISOString(),
        item:            document.getElementById('produceName').value,
        quantity:        qty + ' kg',
        price:           prc,
        buyer:           result.transaction?.buyer_name || 'Market Sale',
        total:           qty * prc,
        transactionId:   result.transaction?.id || 'N/A',
        id:              result.transaction?.id || 'N/A',
        grade:           document.getElementById('aiGrade').value,
        blockchainHash:  result.hash ? result.hash.substring(0, 16) + '...' : 'N/A'
    });

    localStorage.setItem(historyKey, JSON.stringify(history));
}