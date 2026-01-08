/**
 * Agmarknet Price Fetcher
 * Fetches vegetable prices from data.gov.in API and returns price based on grade
 */

class AgmarknetPriceFetcher {
    constructor(apiKey = "579b464db66ec23bdd00000114eff3abdc594c2a48422df1e22214a6") {
        this.baseUrl = "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070";
        this.apiKey = apiKey;
    }

    /**
     * Build API URL with filters
     * @param {string} state - State name
     * @param {string} district - District name
     * @param {string} commodity - Commodity name
     * @returns {string} - Complete API URL
     */
    buildApiUrl(state, district, commodity) {
        const encodedState = encodeURIComponent(state);
        const encodedDistrict = encodeURIComponent(district);
        const encodedCommodity = encodeURIComponent(commodity);

        return `${this.baseUrl}?api-key=${this.apiKey}&format=json` +
               `&filters%5Bstate.keyword%5D=${encodedState}` +
               `&filters%5Bdistrict%5D=${encodedDistrict}` +
               `&filters%5Bcommodity%5D=${encodedCommodity}`;
    }

    /**
     * Fetch price data from API
     * @param {string} state - State name
     * @param {string} district - District name
     * @param {string} commodity - Commodity name
     * @returns {Promise<Object|null>} - API response data or null if error
     */


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

    /**
     * Get price based on grade
     * @param {Object} apiData - API response data
     * @param {string} grade - Grade (A, B, or C)
     * @returns {Object|null} - Price information or null
     */
    getPriceByGrade(apiData, grade) {
        if (!apiData || !apiData.records || apiData.records.length === 0) {
            return null;
        }

        const record = apiData.records[0];
        const gradeUpper = grade.toUpperCase();

        // Map grades to price types
        const gradePriceMap = {
            'A': 'max_price',     // Grade A → Max Price
            'B': 'modal_price',   // Grade B → Modal Price
            'C': 'min_price'      // Grade C → Min Price
        };

        if (!gradePriceMap[gradeUpper]) {
            console.error(`Invalid grade '${grade}'. Must be A, B, or C.`);
            return null;
        }

        const priceType = gradePriceMap[gradeUpper];
        const priceValue = record[priceType];

        if (priceValue === undefined || priceValue === null) {
            console.error(`Price data not available for ${priceType}`);
            return null;
        }

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

    /**
     * Main function to get price based on parameters
     * @param {string} state - State name
     * @param {string} district - District name
     * @param {string} commodity - Commodity name
     * @param {string} grade - Grade (A, B, or C)
     * @returns {Promise<Object>} - Result object with price information
     */
    async getPrice(state, district, commodity, grade) {
        console.log(`Getting price for: ${commodity} in ${district}, ${state} with grade ${grade}`);

        // Validate inputs
        if (!state || !district || !commodity || !grade) {
            return {
                success: false,
                error: 'Missing required parameters',
                message: 'Please provide state, district, commodity, and grade'
            };
        }

        const validGrades = ['A', 'B', 'C'];
        if (!validGrades.includes(grade.toUpperCase())) {
            return {
                success: false,
                error: 'Invalid grade',
                message: 'Grade must be A, B, or C'
            };
        }

        try {
            // Fetch data from API
            const apiData = await this.fetchPriceData(state, district, commodity);

            if (!apiData) {
                return {
                    success: false,
                    error: 'No data found',
                    message: `No price data available for ${commodity} in ${district}, ${state}`
                };
            }

            // Get price based on grade
            const priceInfo = this.getPriceByGrade(apiData, grade);

            if (!priceInfo) {
                return {
                    success: false,
                    error: 'Price calculation failed',
                    message: 'Could not calculate price based on grade'
                };
            }

            return {
                success: true,
                data: priceInfo,
                message: `Price fetched successfully for Grade ${grade}`
            };

        } catch (error) {
            return {
                success: false,
                error: 'API Error',
                message: error.message,
                details: 'Failed to fetch data from Agmarknet API'
            };
        }
    }

    /**
     * Format price result for display
     * @param {Object} result - Result from getPrice()
     * @returns {string} - Formatted string
     */
    formatResult(result) {
        if (!result.success || !result.data) {
            return `❌ Error: ${result.message}`;
        }

        const data = result.data;
        const priceFormatted = new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(data.selectedPrice);

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

//temp hardcoded attributes
const state = "Maharashtra";
const district = "Sholapur";
const commodity = "Tomato";

// Example 1: Direct function call with parameters
async function exampleDirectCall() {
    console.log('='.repeat(50));
    console.log('EXAMPLE 1: Direct Function Call');
    console.log('='.repeat(50));

    const fetcher = new AgmarknetPriceFetcher();

    // Direct parameter call
    const result = await fetcher.getPrice(
        'Maharashtra',  // state
        'Sholapur',     // district
        'Tomato',       // commodity
        'A'             // grade
    );

    console.log(fetcher.formatResult(result));
    console.log('\nRaw JSON Result:', JSON.stringify(result, null, 2));
}

// Example 2: Using JSON input
async function exampleJsonInput() {
    console.log('\n' + '='.repeat(50));
    console.log('EXAMPLE 2: JSON Input');
    console.log('='.repeat(50));

    const fetcher = new AgmarknetPriceFetcher();

    // JSON input object
    const inputParams = {
        state: 'Maharashtra',
        district: 'Sholapur',
        commodity: 'Tomato',
        grade: 'B'
    };

    const result = await fetcher.getPrice(
        inputParams.state,
        inputParams.district,
        inputParams.commodity,
        inputParams.grade
    );

    console.log(fetcher.formatResult(result));
}

// Example 3: Multiple grade examples
async function exampleMultipleGrades() {
    console.log('\n' + '='.repeat(50));
    console.log('EXAMPLE 3: Multiple Grades Comparison');
    console.log('='.repeat(50));

    const fetcher = new AgmarknetPriceFetcher();
    const params = {
        state: 'Maharashtra',
        district: 'Sholapur',
        commodity: 'Tomato'
    };

    const grades = ['A', 'B', 'C'];

    for (const grade of grades) {
        console.log(`\n📋 Grade ${grade}:`);
        const result = await fetcher.getPrice(
            params.state,
            params.district,
            params.commodity,
            grade
        );

        if (result.success) {
            const priceFormatted = new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR',
                minimumFractionDigits: 0
            }).format(result.data.selectedPrice);

            console.log(`   Price: ${priceFormatted} (${result.data.selectedPriceType})`);
        } else {
            console.log(`   Error: ${result.message}`);
        }
    }
}

// Example 4: Error handling examples
async function exampleErrorHandling() {
    console.log('\n' + '='.repeat(50));
    console.log('EXAMPLE 4: Error Handling');
    console.log('='.repeat(50));

    const fetcher = new AgmarknetPriceFetcher();

    // Test 1: Missing parameters
    console.log('\nTest 1: Missing parameters');
    const result1 = await fetcher.getPrice('Maharashtra', '', 'Tomato', 'A');
    console.log(result1.message);

    // Test 2: Invalid grade
    console.log('\nTest 2: Invalid grade');
    const result2 = await fetcher.getPrice('Maharashtra', 'Sholapur', 'Tomato', 'D');
    console.log(result2.message);

    // Test 3: Non-existent data
    console.log('\nTest 3: Non-existent data');
    const result3 = await fetcher.getPrice('TestState', 'TestDistrict', 'TestCommodity', 'A');
    console.log(result3.message);
}

// Utility function for web integration
async function getVegetablePrice(parameters) {
    /**
     * Main utility function for web integration
     * @param {Object|string} parameters - Either an object with {state, district, commodity, grade} or a JSON string
     * @returns {Promise<Object>} - Price result
     */

    const fetcher = new AgmarknetPriceFetcher();

    // Parse parameters if they come as JSON string
    let params;
    if (typeof parameters === 'string') {
        try {
            params = JSON.parse(parameters);
        } catch (error) {
            return {
                success: false,
                error: 'Invalid JSON',
                message: 'Parameters must be valid JSON string'
            };
        }
    } else {
        params = parameters;
    }

    // Extract parameters
    const { state, district, commodity, grade } = params;

    return await fetcher.getPrice(state, district, commodity, grade);
}

// Run examples when in Node.js environment
if (typeof window === 'undefined') {
    // Node.js environment
    (async () => {
        await exampleDirectCall();
        await exampleJsonInput();
        await exampleMultipleGrades();
        await exampleErrorHandling();

        console.log('\n' + '='.repeat(50));
        console.log('UTILITY FUNCTION EXAMPLE');
        console.log('='.repeat(50));

        // Example using the utility function
        const params = {
            state: 'Maharashtra',
            district: 'Sholapur',
            commodity: 'Tomato',
            grade: 'C'
        };

        const result = await getVegetablePrice(params);
        console.log(`Grade ${result.data?.inputGrade}: ₹${result.data?.selectedPrice}`);
    })();
}

// Export for use in browser
if (typeof window !== 'undefined') {
    window.AgmarknetPriceFetcher = AgmarknetPriceFetcher;
    window.getVegetablePrice = getVegetablePrice;
}

// Export for Node.js/ES modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        AgmarknetPriceFetcher,
        getVegetablePrice
    };
}

//helper function for price from grade
async function getPriceFromGrade(grade) {
    const fetcher = new AgmarknetPriceFetcher();

    return await fetcher.getPrice(
        state,
        district,
        commodity,
        grade
    );
}
