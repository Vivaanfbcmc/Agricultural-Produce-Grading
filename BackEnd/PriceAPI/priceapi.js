/**
 * Agmarknet Price Fetcher
 * Fetches vegetable prices from data.gov.in API
 * Uses May 2025 - October 2025 historical data for smart price estimation
 *
 * Smart pricing logic:
 *  1. Fetch ALL paginated records for the commodity/district/state
 *  2. Filter to May 2025 – Oct 2025 season only
 *  3. Remove outliers using IQR method
 *  4. Compute weighted average (recent records weighted higher)
 *  5. Return grade-based price: A=max, B=modal, C=min
 */

const SEASON_FROM = "2025-05-01";
const SEASON_TO   = "2025-10-31";

class AgmarknetPriceFetcher {
    constructor(apiKey = "579b464db66ec23bdd000001530332d5022645b7724118b3558eb825") {
        this.baseUrl = "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070";
        this.apiKey  = apiKey;
    }

    // ── API URL builder (with pagination support) ────────────────────────────
    buildApiUrl(state, district, commodity, offset = 0, limit = 100) {
        return `${this.baseUrl}?api-key=${this.apiKey}&format=json&limit=${limit}&offset=${offset}` +
            `&filters%5Bstate.keyword%5D=${encodeURIComponent(state)}` +
            `&filters%5Bdistrict%5D=${encodeURIComponent(district)}` +
            `&filters%5Bcommodity%5D=${encodeURIComponent(commodity)}`;
    }

    // ── Fetch ALL records with pagination ────────────────────────────────────
    async fetchAllRecords(state, district, commodity) {
        let allRecords = [];
        let offset     = 0;
        const limit    = 100;

        while (true) {
            const url      = this.buildApiUrl(state, district, commodity, offset, limit);
            console.log(`📡 Fetching offset=${offset}...`);
            const response = await fetch(url);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            if (data.status !== "ok" || !data.records || data.records.length === 0) break;

            allRecords = allRecords.concat(data.records);
            console.log(`   Got ${data.records.length} records (total so far: ${allRecords.length} / ${data.count})`);

            if (data.records.length < limit || allRecords.length >= data.count) break;
            offset += limit;
        }

        console.log(`✅ Total records fetched: ${allRecords.length}`);
        return allRecords;
    }

    // ── Filter to May 2025 – Oct 2025 ────────────────────────────────────────
    filterBySeason(records) {
        const from = new Date(SEASON_FROM);
        const to   = new Date(SEASON_TO);

        return records.filter(r => {
            const dateStr = r.arrival_date || r.date || "";
            if (!dateStr) return false;

            let d;
            if (dateStr.includes("/")) {
                // Handle DD/MM/YYYY format
                const parts = dateStr.split("/");
                if (parts.length === 3) {
                    const [day, month, year] = parts;
                    d = new Date(`${year}-${month.padStart(2,"0")}-${day.padStart(2,"0")}`);
                }
            } else {
                d = new Date(dateStr);
            }

            if (!d || isNaN(d.getTime())) return false;
            return d >= from && d <= to;
        });
    }

    // ── Smart price computation ───────────────────────────────────────────────
    // Steps: parse → remove outliers (IQR) → weighted average (recency-biased)
    computeSmartPrice(records) {
        if (!records || records.length === 0) return null;

        // Parse prices from records
        const parsed = records.map(r => ({
            date:  r.arrival_date || r.date || "",
            min:   parseFloat(r.min_price)   || parseFloat(r.minimum_price)      || 0,
            max:   parseFloat(r.max_price)   || parseFloat(r.maximum_price)      || 0,
            modal: parseFloat(r.modal_price) || parseFloat(r.modal_price_rs_qtl) || 0,
        })).filter(r => r.min > 0 || r.max > 0 || r.modal > 0);

        if (parsed.length === 0) return null;

        // Sort by date ascending so recency weighting makes sense
        parsed.sort((a, b) => new Date(a.date) - new Date(b.date));

        // ── Outlier removal using IQR on modal price ──────────────────────────
        const modals = parsed.map(r => r.modal).filter(v => v > 0).sort((a, b) => a - b);
        const q1     = modals[Math.floor(modals.length * 0.25)] || 0;
        const q3     = modals[Math.floor(modals.length * 0.75)] || Infinity;
        const iqr    = q3 - q1;
        const lower  = q1 - 1.5 * iqr;
        const upper  = q3 + 1.5 * iqr;

        const clean = parsed.filter(r =>
            r.modal === 0 || (r.modal >= lower && r.modal <= upper)
        );

        console.log(`📊 Records: total=${parsed.length}, after outlier removal=${clean.length}`);

        // ── Weighted average (index+1 = weight, higher = more recent) ─────────
        let wMin = 0, wMax = 0, wModal = 0, wTotal = 0;
        clean.forEach((r, i) => {
            const w  = i + 1;
            wMin    += r.min   * w;
            wMax    += r.max   * w;
            wModal  += r.modal * w;
            wTotal  += w;
        });

        // Simple averages (for reference / fallback)
        const n           = clean.length;
        const simpleMin   = Math.round(clean.reduce((s, r) => s + r.min,   0) / n);
        const simpleMax   = Math.round(clean.reduce((s, r) => s + r.max,   0) / n);
        const simpleModal = Math.round(clean.reduce((s, r) => s + r.modal, 0) / n);

        return {
            weighted_avg_min:   Math.round(wMin   / wTotal),
            weighted_avg_max:   Math.round(wMax   / wTotal),
            weighted_avg_modal: Math.round(wModal / wTotal),
            simple_avg_min:     simpleMin,
            simple_avg_max:     simpleMax,
            simple_avg_modal:   simpleModal,
            records_used:       n,
            total_fetched:      parsed.length,
            season:             `${SEASON_FROM} to ${SEASON_TO}`
        };
    }

    // ── Main getPrice ─────────────────────────────────────────────────────────
    async getPrice(state, district, commodity, grade) {
        if (!state || !district || !commodity || !grade) {
            return { success: false, error: 'Missing required parameters', message: 'Provide state, district, commodity, and grade' };
        }
        if (!['A', 'B', 'C'].includes(grade.toUpperCase())) {
            return { success: false, error: 'Invalid grade', message: 'Grade must be A, B, or C' };
        }

        try {
            // 1. Fetch all records
            const all = await this.fetchAllRecords(state, district, commodity);
            if (!all || all.length === 0) {
                return { success: false, error: 'No data found', message: `No data for "${commodity}" in ${district}, ${state}. Check spelling.` };
            }

            // 2. Filter to season
            const seasonal      = this.filterBySeason(all);
            const usedSeasonal  = seasonal.length > 0;
            const recordsToUse  = usedSeasonal ? seasonal : all;

            if (!usedSeasonal) {
                console.warn("⚠️  No records in May–Oct 2025, using all available records as fallback");
            } else {
                console.log(`🌿 Season records (May–Oct 2025): ${seasonal.length}`);
            }

            // 3. Compute smart price
            const smart = this.computeSmartPrice(recordsToUse);
            if (!smart) {
                return { success: false, error: 'Calculation failed', message: 'All prices were zero — data may be incomplete' };
            }

            // 4. Select price by grade
            const g = grade.toUpperCase();
            const selectedPrice =
                g === "A" ? smart.weighted_avg_max   :
                g === "B" ? smart.weighted_avg_modal :
                            smart.weighted_avg_min;

            const selectedPriceType =
                g === "A" ? "weighted_avg_max_price"   :
                g === "B" ? "weighted_avg_modal_price" :
                            "weighted_avg_min_price";

            const sample = recordsToUse[0];
            return {
                success: true,
                data: {
                    state:              sample.state     || state,
                    district:           sample.district  || district,
                    market:             sample.market    || '',
                    commodity:          sample.commodity || commodity,
                    variety:            sample.variety   || '',
                    inputGrade:         g,
                    selectedPrice,
                    selectedPriceType,
                    // All 3 smart prices
                    minPrice:           smart.weighted_avg_min,
                    maxPrice:           smart.weighted_avg_max,
                    modalPrice:         smart.weighted_avg_modal,
                    // Simple averages for reference
                    simpleAvgMin:       smart.simple_avg_min,
                    simpleAvgMax:       smart.simple_avg_max,
                    simpleAvgModal:     smart.simple_avg_modal,
                    // Stats
                    recordsUsed:        smart.records_used,
                    totalFetched:       smart.total_fetched,
                    season:             smart.season,
                    usedSeasonData:     usedSeasonal,
                    timestamp:          new Date().toISOString()
                },
                message: `Smart price estimated from ${smart.records_used} records (${smart.season})`
            };

        } catch (error) {
            return { success: false, error: 'API Error', message: error.message };
        }
    }
}

async function getVegetablePrice(params) {
    const fetcher = new AgmarknetPriceFetcher();
    if (typeof params === 'string') {
        try { params = JSON.parse(params); } catch { return { success: false, error: 'Invalid JSON', message: 'Parameters must be valid JSON' }; }
    }
    const { state, district, commodity, grade } = params;
    return await fetcher.getPrice(state, district, commodity, grade);
}

export { AgmarknetPriceFetcher, getVegetablePrice };