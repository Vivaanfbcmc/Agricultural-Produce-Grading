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

// Default location and commodity
const DEFAULT_STATE = 'Maharashtra';
const DEFAULT_DISTRICT = 'Sholapur';
const DEFAULT_COMMODITY = 'Tomato';

// Drag and drop functionality
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

// Handle file selection
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
        resultImage.src = e.target.result;

        const img = new Image();
        img.onload = function() {
            fileDimensions.textContent = `${img.width} × ${img.height}px`;
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);

    previewContainer.style.display = 'block';
    analyzeBtn.disabled = false;
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
    else return (bytes / 1048576).toFixed(2) + ' MB';
}

// CHANGE: All API calls now go through gateway
async function analyzeImage() {
    if (!currentImage) return;

    loading.style.display = 'block';
    analyzeBtn.disabled = true;
    resultSection.style.display = 'none';

    try {
        // Step 1: Get grade from ML service via gateway
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

        let grade = mlJson.grade || "Rotten";
        if (grade.toUpperCase() === "D") grade = "Rotten";
        grade = grade.toUpperCase();
        gradeValue.textContent = grade;

        // Step 2: Get price from price API via gateway
        priceValue.textContent = "Fetching market price...";

        const priceRes = await fetch("/api/price", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                state: DEFAULT_STATE,
                district: DEFAULT_DISTRICT,
                commodity: DEFAULT_COMMODITY,
                grade
            })
        });

        const priceJson = await priceRes.json();

        if (priceJson.success && typeof priceJson.selectedPrice === 'number') {
            priceValue.textContent = `${new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR'
            }).format(priceJson.selectedPrice)} per unit (Grade ${grade})`;
        } else {
            priceValue.textContent = "Price not available for this grade.";
        }

        generateAnalysisDetails(grade);
        resultSection.style.display = 'block';
        resultSection.scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
        console.error('Analysis error:', err);
        alert(`Error: ${err.message}`);
    } finally {
        loading.style.display = 'none';
        analyzeBtn.disabled = false;
    }
}

// Generate analysis details for each grade
function generateAnalysisDetails(grade) {
    analysisDetails.innerHTML = '';

    const detailsMap = {
        'A': [
            { label: 'Freshness', value: 'Excellent', color: '#059669' },
            { label: 'Color', value: 'Vibrant & Uniform', color: '#059669' },
            { label: 'Texture', value: 'Firm & Crisp', color: '#059669' },
            { label: 'Size Consistency', value: 'Highly Consistent', color: '#059669' },
            { label: 'Defects', value: 'Minimal to None', color: '#059669' }
        ],
        'B': [
            { label: 'Freshness', value: 'Good', color: '#f59e0b' },
            { label: 'Color', value: 'Slightly Faded', color: '#f59e0b' },
            { label: 'Texture', value: 'Mostly Firm', color: '#f59e0b' },
            { label: 'Size Consistency', value: 'Moderately Consistent', color: '#f59e0b' },
            { label: 'Defects', value: 'Minor Blemishes', color: '#f59e0b' }
        ],
        'C': [
            { label: 'Freshness', value: 'Average', color: '#f97316' },
            { label: 'Color', value: 'Noticeably Faded', color: '#f97316' },
            { label: 'Texture', value: 'Some Soft Spots', color: '#f97316' },
            { label: 'Size Consistency', value: 'Inconsistent', color: '#f97316' },
            { label: 'Defects', value: 'Visible Blemishes', color: '#f97316' }
        ],
        'ROTTEN': [
            { label: 'Freshness', value: 'Poor', color: '#dc2626' },
            { label: 'Color', value: 'Dull & Discolored', color: '#dc2626' },
            { label: 'Texture', value: 'Soft & Wilted', color: '#dc2626' },
            { label: 'Size Consistency', value: 'Highly Inconsistent', color: '#dc2626' },
            { label: 'Defects', value: 'Significant Damage', color: '#dc2626' }
        ]
    };

    const gradeDetails = detailsMap[grade] || detailsMap['B'];
    gradeDetails.forEach(detail => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${detail.label}:</strong> <span style="color: ${detail.color}">${detail.value}</span>`;
        analysisDetails.appendChild(li);
    });
}

// Reset the app for another image
function resetApp() {
    fileInput.value = '';
    previewContainer.style.display = 'none';
    resultSection.style.display = 'none';
    analyzeBtn.disabled = true;
    previewImage.src = '';
    resultImage.src = '';
    currentImage = null;
    uploadArea.scrollIntoView({ behavior: 'smooth' });
}

window.addEventListener('DOMContentLoaded', () => {
    console.log('VEGEGRADE AI ready.');
    initializeTransactionModal();
});

// ==================== TRANSACTION MODAL FUNCTIONS ====================

// Track analysis results for transaction
let analysisResults = {
    grade: '',
    price: '',
    produceName: 'Tomato'
};

function initializeTransactionModal() {
    // Get farmer ID from localStorage or session
    const farmerId = localStorage.getItem('farmerId') || 'F' + Date.now();
    document.getElementById('farmerId').value = farmerId;

    // Load market price if available
    const savedPrice = localStorage.getItem('lastMarketPrice');
    if (savedPrice) {
        document.getElementById('price').value = savedPrice;
    }

    // Calculate total amount when quantity or price changes
    document.getElementById('quantity').addEventListener('change', calculateTotal);
    document.getElementById('price').addEventListener('change', calculateTotal);
}

function calculateTotal() {
    const quantity = parseFloat(document.getElementById('quantity').value) || 0;
    const price = parseFloat(document.getElementById('price').value) || 0;
    const total = quantity * price;
    document.getElementById('totalAmount').textContent = `₹${total.toFixed(2)}`;
}

function openTransactionModal() {
    const modal = document.getElementById('transactionModal');
    const grade = gradeValue.textContent;
    const price = priceValue.textContent.match(/[\d.]+/) ? priceValue.textContent.match(/[\d.]+/)[0] : '';

    // Detect produce name from AI analysis
    analysisResults.grade = grade;
    analysisResults.price = price;

    // Auto-fill the modal fields
    document.getElementById('aiGrade').value = grade;
    document.getElementById('produceName').value = analysisResults.produceName;

    // Try to detect produce type from analysis details
    const detailsText = analysisDetails.innerText.toLowerCase();
    if (detailsText.includes('tomato')) {
        analysisResults.produceName = 'Tomato';
    } else if (detailsText.includes('potato')) {
        analysisResults.produceName = 'Potato';
    } else if (detailsText.includes('carrot')) {
        analysisResults.produceName = 'Carrot';
    }
    document.getElementById('produceName').value = analysisResults.produceName;

    // Pre-fill price if available
    if (price) {
        document.getElementById('price').value = price;
        calculateTotal();
    }

    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeTransactionModal() {
    const modal = document.getElementById('transactionModal');
    modal.classList.remove('show');
    document.body.style.overflow = 'auto';

    // Reset form
    document.getElementById('transactionForm').reset();
    document.getElementById('errorMessage').style.display = 'none';
}

async function submitTransaction() {
    const farmerId = document.getElementById('farmerId').value;
    const produceName = document.getElementById('produceName').value;
    const quantity = parseFloat(document.getElementById('quantity').value);
    const aiGrade = document.getElementById('aiGrade').value;
    const price = parseFloat(document.getElementById('price').value);
    const status = document.getElementById('status').value;

    // Validation
    if (!quantity || quantity <= 0) {
        showError('Please enter a valid quantity');
        return;
    }
    if (!price || price <= 0) {
        showError('Please enter a valid price');
        return;
    }

    // Show loading state
    document.getElementById('submitTransactionBtn').disabled = true;
    document.getElementById('loadingModal').style.display = 'block';
    document.getElementById('errorMessage').style.display = 'none';

    try {
        const transactionData = {
            farmer_id: farmerId,
            produce_name: produceName,
            quantity: quantity,
            ai_grade: aiGrade,
            price: price,
            status: status
        };

        console.log('Submitting transaction:', transactionData);

        // Call the blockchain transaction API
        const response = await fetch('/api/blockchain/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(transactionData)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to create transaction');
        }

        // Success message
        showSuccess(result);

    } catch (err) {
        console.error('Transaction submission error:', err);
        showError(err.message || 'Error creating transaction. Please try again.');
    } finally {
        document.getElementById('submitTransactionBtn').disabled = false;
        document.getElementById('loadingModal').style.display = 'none';
    }
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = '❌ Error: ' + message;
    errorDiv.style.display = 'block';
    errorDiv.scrollIntoView({ behavior: 'smooth' });
}

// function showSuccess(result) {
//     alert(
//         `✅ Transaction Created Successfully!\n\n` +
//         `Transaction ID: ${result.transaction?.id || 'N/A'}\n` +
//         `Ledger Entry ID: ${result.ledger_entry_id}\n` +
//         `Hash: ${result.hash?.substring(0, 16)}...\n\n` +
//         `🔗 Blockchain Status:\n` +
//         `Tx Hash: ${result.transaction?.blockchain_tx_hash || 'Pending'}\n\n` +
//         `Your transaction has been recorded on Sepolia Testnet.`
//     );
//
//     // Close modal and reset
//     closeTransactionModal();
//
//     // Save price for next transaction
//     localStorage.setItem('lastMarketPrice', document.getElementById('price').value);
// }

function showSuccess(result) {
    alert(
        'Transaction Created Successfully!\n\n' +
        'Transaction ID: ' + (result.transaction?.id || 'N/A') + '\n' +
        'Ledger Entry ID: ' + result.ledger_entry_id + '\n' +
        'Hash: ' + result.hash?.substring(0, 16) + '...\n\n' +
        'Your transaction has been recorded in the ledger.'
    );

    // Save to history
    saveTransactionToHistory(result);

    closeTransactionModal();
    localStorage.setItem('lastMarketPrice', document.getElementById('price').value);
}

function saveTransactionToHistory(result) {
    const history = JSON.parse(localStorage.getItem('vegegrade_history') || '[]');

    const historyEntry = {
        date: new Date().toISOString(),
        item: document.getElementById('produceName').value,
        quantity: document.getElementById('quantity').value + ' kg',
        price: parseFloat(document.getElementById('price').value),
        buyer: result.transaction?.buyer_name || 'Market Sale',
        total: parseFloat(document.getElementById('quantity').value) * parseFloat(document.getElementById('price').value),
        transactionId: result.transaction?.id || 'N/A',
        grade: document.getElementById('aiGrade').value,
        blockchainHash: result.hash?.substring(0, 16) + '...' || 'N/A'
    };

    history.unshift(historyEntry);
    localStorage.setItem('vegegrade_history', JSON.stringify(history));
    console.log('Transaction saved to history:', historyEntry);
}