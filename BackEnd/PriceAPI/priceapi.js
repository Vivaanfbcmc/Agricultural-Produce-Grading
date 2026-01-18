/**
 * Agmarknet Price Fetcher
 * Fetches vegetable prices from data.gov.in API and returns price based on grade
 */

class AgmarknetPriceFetcher {
    constructor(apiKey = "579b464db66ec23bdd00000114eff3abdc594c2a48422df1e22214a6") {
        this.baseUrl = "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070";
        this.apiKey = apiKey;
    }

    buildApiUrl(state, district, commodity) {
        const encodedState = encodeURIComponent(state);
        const encodedDistrict = encodeURIComponent(district);
        const encodedCommodity = encodeURIComponent(commodity);

        return `${this.baseUrl}?api-key=${this.apiKey}&format=json` +
            `&filters%5Bstate.keyword%5D=${encodedState}` +
            `&filters%5Bdistrict%5D=${encodedDistrict}` +
            `&filters%5Bcommodity%5D=${encodedCommodity}`;
    }

    async fetchPriceData(state, district, commodity) {
        const url = this.buildApiUrl(state, district, commodity);

        try {
            console.log(`Fetching data from: ${url}`);
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const data = await response.json();

            if (data.status === "ok" && data.count > 0) {
                console.log(`Successfully fetched ${data.count} record(s)`);
                return data;
            } else {
                console.warn(`No data found for ${commodity} in ${district}, ${state}`);
                return null;
            }
        } catch (error) {
            console.error(`Error fetching data: ${error.message}`);
            return null;
        }
    }

    getPriceByGrade(apiData, grade) {
        if (!apiData || !apiData.records || apiData.records.length === 0) return null;

        const record = apiData.records[0];
        const gradeUpper = grade.toUpperCase();

        const gradePriceMap = {
            'A': 'max_price',
            'B': 'modal_price',
            'C': 'min_price'
        };

        if (!gradePriceMap[gradeUpper]) return null;

        const priceType = gradePriceMap[gradeUpper];
        const priceValue = record[priceType];

        if (priceValue === undefined || priceValue === null) return null;

        return {
            state: record.state || '',
            district: record.district || '',
            market: record.market || '',
            commodity: record.commodity || '',
            variety: record.variety || '',
            recordedGrade: record.grade || '',
            inputGrade: gradeUpper,
            arrivalDate: record.arrival_date || '',
            minPrice: record.min_price || 0,
            maxPrice: record.max_price || 0,
            modalPrice: record.modal_price || 0,
            selectedPriceType: priceType,
            selectedPrice: priceValue,
            timestamp: new Date().toISOString()
        };
    }

    async getPrice(state, district, commodity, grade) {
        if (!state || !district || !commodity || !grade) {
            return { success: false, error: 'Missing required parameters', message: 'Provide state, district, commodity, and grade' };
        }

        const validGrades = ['A', 'B', 'C'];
        if (!validGrades.includes(grade.toUpperCase())) {
            return { success: false, error: 'Invalid grade', message: 'Grade must be A, B, or C' };
        }

        try {
            const apiData = await this.fetchPriceData(state, district, commodity);

            if (!apiData) return { success: false, error: 'No data found', message: `No price data for ${commodity} in ${district}, ${state}` };

            const priceInfo = this.getPriceByGrade(apiData, grade);

            if (!priceInfo) return { success: false, error: 'Price calculation failed', message: 'Could not calculate price for grade' };

            return { success: true, data: priceInfo, message: `Price fetched successfully for Grade ${grade}` };
        } catch (error) {
            return { success: false, error: 'API Error', message: error.message };
        }
    }

    formatResult(result) {
        if (!result.success || !result.data) return `❌ Error: ${result.message}`;

        const data = result.data;
        const priceFormatted = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(data.selectedPrice);

        return `
📍 Location: ${data.district}, ${data.state}
🏪 Market: ${data.market}
🥦 Commodity: ${data.commodity} (${data.variety})
📅 Arrival Date: ${data.arrivalDate}
📊 Grade in Data: ${data.recordedGrade}
🎯 Selected Grade: ${data.inputGrade}
💰 Price Type: ${data.selectedPriceType.replace('_', ' ').toUpperCase()}
💵 Selected Price: ${priceFormatted} per unit
📈 All Available Prices:
   Minimum Price: ₹${data.minPrice.toLocaleString('en-IN')}
   Maximum Price: ₹${data.maxPrice.toLocaleString('en-IN')}
   Modal Price: ₹${data.modalPrice.toLocaleString('en-IN')}
        `.trim();
    }
}

// Utility function for web integration
async function getVegetablePrice(params) {
    const fetcher = new AgmarknetPriceFetcher();
    if (typeof params === 'string') {
        try { params = JSON.parse(params); } catch { return { success: false, error: 'Invalid JSON', message: 'Parameters must be valid JSON' }; }
    }
    const { state, district, commodity, grade } = params;
    return await fetcher.getPrice(state, district, commodity, grade);
}

export { AgmarknetPriceFetcher, getVegetablePrice };
