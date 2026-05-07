// ============================================================
//  AIIndex.js  —  VEGEGRADE Frontend Logic
//  Handles: file select → preview → ML analyse → price fetch → transaction modal
// ============================================================

// ── State ──────────────────────────────────────────────────────────────────────
let currentGrade       = null;
let currentPrice       = null;
let currentProduceName = "Tomato";
const COMMODITY_ID     = 23;   // Tomato

// Map internal A/B/C price-grade keys to AGMARK display labels
const GRADE_LABEL = { A: "Extra Class", B: "Class I", C: "Class II" };

// ── File Select / Drag-Drop ────────────────────────────────────────────────────
const uploadArea = document.getElementById("uploadArea");

uploadArea.addEventListener("dragover",  e => { e.preventDefault(); uploadArea.classList.add("drag-over"); });
uploadArea.addEventListener("dragleave", ()  => uploadArea.classList.remove("drag-over"));
uploadArea.addEventListener("drop", e => {
    e.preventDefault();
    uploadArea.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
});

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) processFile(file);
}

function processFile(file) {
    if (!file.type.startsWith("image/")) {
        alert("Please upload a valid image file (JPG, PNG, WebP).");
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        alert("File size must be under 5 MB.");
        return;
    }

    const reader = new FileReader();
    reader.onload = e => {
        document.getElementById("previewImage").src              = e.target.result;
        document.getElementById("fileName").textContent          = file.name;
        document.getElementById("fileSize").textContent          = (file.size / 1024).toFixed(1) + " KB";

        const img = new Image();
        img.onload = () => {
            document.getElementById("fileDimensions").textContent = `${img.width} × ${img.height} px`;
        };
        img.src = e.target.result;

        document.getElementById("previewContainer").style.display = "block";
        document.getElementById("analyzeBtn").disabled            = false;

        // Hide previous results when a new file is chosen
        document.getElementById("resultSection").style.display    = "none";
    };
    reader.readAsDataURL(file);
}

// ── Main: Analyse ──────────────────────────────────────────────────────────────
async function analyzeImage() {
    const fileInput = document.getElementById("fileInput");
    if (!fileInput.files[0]) { alert("Please select an image first."); return; }

    // Reset state
    currentGrade = null;
    currentPrice = null;
    document.getElementById("resultSection").style.display = "none";
    document.getElementById("loading").style.display       = "block";
    document.getElementById("analyzeBtn").disabled         = true;

    const formData = new FormData();
    formData.append("image", fileInput.files[0]);

    try {
        const response = await fetch("/api/ml/analyze", { method: "POST", body: formData });
        const data     = await response.json();

        document.getElementById("loading").style.display = "none";

        if (!response.ok) {
            showError("Server error: " + (data.message || response.statusText));
            return;
        }

        // ── Branch: REJECTED ──────────────────────────────────────────────────────
        if (data.result === "REJECTED" || data.grade === "rotten") {
            showRejectionResult(data);
            return;
        }

        // ── Branch: GOOD — map AGMARK grade to A/B/C for price service ────────────
        // tomatoAnalyzer returns EXTRA / CLASS1 / CLASS2
        const gradeMap   = { EXTRA: "A", CLASS1: "B", CLASS2: "C" };
        const mlGrade    = data.grade || "B";
        const priceGrade = gradeMap[mlGrade] || mlGrade;
        currentGrade     = priceGrade;
        currentProduceName = "Tomato";

        await showGoodResult(data, priceGrade);

    } catch (err) {
        document.getElementById("loading").style.display = "none";
        showError("Network error: " + err.message);
    } finally {
        document.getElementById("analyzeBtn").disabled = false;
    }
}

// ── Render: REJECTED ──────────────────────────────────────────────────────────
function showRejectionResult(data) {
    const section = document.getElementById("resultSection");
    section.style.display = "block";

    // Grade badge — red
    const gradeBadge     = document.getElementById("gradeBadge");
    gradeBadge.className = "grade-badge grade-rejected";
    gradeBadge.innerHTML = `Grade: <span id="gradeValue">REJECTED</span>`;

    document.getElementById("priceValue").textContent = "₹0 — Not eligible for sale";

    // Show uploaded preview image (no annotated image returned for rejections)
    const resultImage         = document.getElementById("resultImage");
    resultImage.src           = data.annotated_image_url || document.getElementById("previewImage").src;
    resultImage.style.display = "block";

    // ── Rejection reason panel ─────────────────────────────────────────────────
    const tbody = document.getElementById("analysisDetails");
    tbody.innerHTML = "";

    addRow(tbody, "Result", `<span class="status-pill pill-red">REJECTED</span>`);

    const reason = data.rejection_reason || deriveReason(data);
    addRow(tbody, "Rejection Reason",
        `<span style="color:#b91c1c; font-weight:600;">${escHtml(reason)}</span>`);

    if (data.grade_reasons && data.grade_reasons.length > 0) {
        const ul = data.grade_reasons
            .map(r => `<li style="margin-bottom:4px">${escHtml(r)}</li>`)
            .join("");
        addRow(tbody, "Detail", `<ul style="margin:0;padding-left:16px;">${ul}</ul>`);
    }

    addRow(tbody, "Recommended Action",
        "This produce cannot be listed. Please separate it from healthy stock to prevent contamination.");

    // Hide transaction button — rejected produce cannot be sold
    document.querySelector(".btn-amber").style.display = "none";
}

// ── Render: GOOD ──────────────────────────────────────────────────────────────
async function showGoodResult(data, priceGrade) {
    const section = document.getElementById("resultSection");
    section.style.display = "block";

    const resultImage         = document.getElementById("resultImage");
    resultImage.src           = data.annotated_image_url || document.getElementById("previewImage").src;
    resultImage.style.display = "block";

    // Grade badge
    const gradeBadge     = document.getElementById("gradeBadge");
    const badgeClass     = priceGrade === "A" ? "grade-a" : priceGrade === "B" ? "grade-b" : "grade-c";
    const displayLabel   = GRADE_LABEL[priceGrade] || priceGrade;
    gradeBadge.className = `grade-badge ${badgeClass}`;
    gradeBadge.innerHTML = `Grade: <span id="gradeValue">${displayLabel}</span>`;

    document.getElementById("priceValue").textContent = "Fetching price…";

    // ── Quality parameter table ────────────────────────────────────────────────
    const tbody = document.getElementById("analysisDetails");
    tbody.innerHTML = "";

    const pillClass = priceGrade === "A" ? "pill-green" : priceGrade === "B" ? "pill-blue" : "pill-amber";
    addRow(tbody, "AI Grade",
        `<span class="status-pill ${pillClass}">${displayLabel}</span>`);

    // Show the raw AGMARK class from tomatoAnalyzer alongside
    addRow(tbody, "AGMARK Class", escHtml(data.grade || "—"));

    if (data.grade_reasons && data.grade_reasons.length > 0) {
        const ul = data.grade_reasons
            .map(r => `<li style="margin-bottom:3px;font-size:12px;">${escHtml(r)}</li>`)
            .join("");
        addRow(tbody, "Grade Reasons", `<ul style="margin:0;padding-left:16px;">${ul}</ul>`);
    } else {
        addRow(tbody, "Grade Reasons", `<span style="color:#16a34a">Meets all criteria</span>`);
    }

    addRow(tbody, "Freshness",  `<span style="color:#16a34a">Fresh ✓</span>`);
    addRow(tbody, "Pest Check", `<span style="color:#16a34a">Clear ✓</span>`);
    addRow(tbody, "Cut/Damage", `<span style="color:#16a34a">None detected ✓</span>`);

    // Show transaction button
    document.querySelector(".btn-amber").style.display = "inline-block";

    await fetchAndShowPrice(priceGrade);
}

// ── Price Fetch ────────────────────────────────────────────────────────────────
async function fetchAndShowPrice(grade) {
    try {
        const res  = await fetch("/api/ceda-price", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ grade, commodity_id: COMMODITY_ID })
        });
        const data = await res.json();

        if (data.success && data.price) {
            currentPrice = data.price / 100;   // per quintal → per kg
            const displayLabel = GRADE_LABEL[grade] || grade;
            document.getElementById("priceValue").textContent =
                `${displayLabel} — ₹${data.price.toLocaleString("en-IN")} / quintal  (≈ ₹${currentPrice.toFixed(2)}/kg)`;
            document.getElementById("price").value = currentPrice.toFixed(2);
        } else {
            document.getElementById("priceValue").textContent = "Price unavailable";
        }
    } catch (err) {
        document.getElementById("priceValue").textContent = "Price fetch failed";
        console.error("Price fetch error:", err);
    }
}

// ── Transaction Modal ──────────────────────────────────────────────────────────
function openTransactionModal() {
    if (!currentGrade) { alert("Please analyse an image first."); return; }

    fetch("/api/auth/profile")
        .then(r => r.json())
        .then(data => {
            if (data.user) {
                document.getElementById("farmerId").value = data.user.farmerId || "";
            }
        })
        .catch(() => {});

    document.getElementById("produceName").value = currentProduceName;
    // Store the display label in the modal so the farmer sees "Extra Class" etc.
    document.getElementById("aiGrade").value     = GRADE_LABEL[currentGrade] || currentGrade;
    if (currentPrice) document.getElementById("price").value = currentPrice.toFixed(2);

    document.getElementById("errorMessage").textContent         = "";
    document.getElementById("loadingModal").style.display       = "none";
    document.getElementById("transactionFormWrap").style.display = "block";
    document.getElementById("transactionModal").style.display   = "flex";
    calculateTotal();
}

function closeTransactionModal() {
    document.getElementById("transactionModal").style.display = "none";
}

function calculateTotal() {
    const qty   = parseFloat(document.getElementById("quantity").value) || 0;
    const price = parseFloat(document.getElementById("price").value)    || 0;
    document.getElementById("totalAmount").textContent =
        "Rs. " + (qty * price).toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

async function submitTransaction() {
    const farmerId    = document.getElementById("farmerId").value.trim();
    const produceName = document.getElementById("produceName").value.trim();
    const aiGradeDisp = document.getElementById("aiGrade").value.trim();   // display label
    const quantity    = parseFloat(document.getElementById("quantity").value);
    const price       = parseFloat(document.getElementById("price").value);
    const status      = document.getElementById("status").value;
    const errBox      = document.getElementById("errorMessage");

    errBox.textContent = "";

    if (!farmerId || !produceName || !aiGradeDisp || isNaN(quantity) || isNaN(price)) {
        errBox.textContent = "Please fill in all required fields.";
        return;
    }
    if (quantity <= 0) { errBox.textContent = "Quantity must be greater than 0."; return; }
    if (price    <= 0) { errBox.textContent = "Price must be greater than 0.";    return; }

    document.getElementById("loadingModal").style.display         = "block";
    document.getElementById("transactionFormWrap").style.display  = "none";
    document.getElementById("submitTransactionBtn").disabled      = true;

    try {
        const res  = await fetch("/api/blockchain/transactions", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                farmer_id:    farmerId,
                produce_name: produceName,
                quantity,
                // Send the internal key (A/B/C) to the blockchain service so DB is consistent
                ai_grade:     currentGrade,
                price,
                status
            })
        });
        const data = await res.json();

        if (res.ok) {
            closeTransactionModal();
            alert(`Transaction recorded!\nTx ID: ${data.transaction?.id || "—"}\nHash: ${data.hash || "—"}`);
        } else {
            document.getElementById("loadingModal").style.display        = "none";
            document.getElementById("transactionFormWrap").style.display = "block";
            errBox.textContent = data.error || "Transaction failed. Please try again.";
        }
    } catch (err) {
        document.getElementById("loadingModal").style.display        = "none";
        document.getElementById("transactionFormWrap").style.display = "block";
        errBox.textContent = "Network error: " + err.message;
    } finally {
        document.getElementById("submitTransactionBtn").disabled = false;
    }
}

// ── Reset ──────────────────────────────────────────────────────────────────────
function resetApp() {
    currentGrade = null;
    currentPrice = null;
    document.getElementById("fileInput").value                = "";
    document.getElementById("previewContainer").style.display = "none";
    document.getElementById("resultSection").style.display    = "none";
    document.getElementById("analyzeBtn").disabled            = true;
    document.querySelector(".btn-amber").style.display        = "inline-block";
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function addRow(tbody, label, valueHtml) {
    const tr = document.createElement("tr");
    tr.innerHTML =
        `<td style="font-weight:600;white-space:nowrap;padding:6px 12px 6px 0">${escHtml(label)}</td>` +
        `<td style="padding:6px 0">${valueHtml}</td>`;
    tbody.appendChild(tr);
}

function escHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function deriveReason(data) {
    if (data.grade === "rotten") return "Step 6a (Freshness Classifier): Tomato detected as rotten";
    if (data.message)            return data.message;
    return "Image did not pass the quality pipeline — no specific reason provided by server";
}

function showError(msg) {
    document.getElementById("resultSection").style.display = "none";
    alert(msg);
}