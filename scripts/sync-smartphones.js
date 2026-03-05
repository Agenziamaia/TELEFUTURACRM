const fs = require('fs');
const path = require('path');

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

// Brands we care about
const TARGET_BRANDS = [
    "Apple", "Samsung", "Xiaomi", "OPPO", "realme",
    "Google", "Motorola", "Honor", "Nothing", "Vivo"
];

async function fetchFromRapidAPI(endpoint) {
    const url = `https://mobile-phone-specs-database.p.rapidapi.com${endpoint}`;
    const options = {
        method: 'GET',
        headers: {
            'x-rapidapi-key': RAPIDAPI_KEY,
            'x-rapidapi-host': 'mobile-phone-specs-database.p.rapidapi.com'
        }
    };

    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            const textUrl = await response.text();
            console.error(`API Fetch Error: Status ${response.status} for ${endpoint}`, textUrl);
            return null;
        }
        const result = await response.json();
        return result;
    } catch (error) {
        console.error("API Fetch Exception:", error);
        return null;
    }
}

async function syncSmartphones() {
    if (!RAPIDAPI_KEY) {
        console.error("❌ Error: RAPIDAPI_KEY environment variable is missing.");
        process.exit(1);
    }

    console.log("🔄 Starting smartphone synchronization...");

    let updatedData = {};

    // Try to read existing data first to preserve it in case the API rate limits us
    const jsonPath = path.join(__dirname, '../src/data/smartphones.json');
    try {
        if (fs.existsSync(jsonPath)) {
            updatedData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        }
    } catch (e) {
        console.warn("Could not read existing smartphones.json, starting fresh.");
    }

    // RapidAPI Mobile Phone Specs Database endpoint:
    // GET /v1/models/by-brand?brandName={brand}
    // Returns: [{ "modelValue": "Galaxy S24 Ultra" }, ...]

    let hasUpdates = false;

    for (const brand of TARGET_BRANDS) {
        console.log(`Fetching latest models for ${brand}...`);

        // Add a small delay to avoid hitting rate limits (e.g. 1 req/sec)
        await new Promise(resolve => setTimeout(resolve, 1000));

        const data = await fetchFromRapidAPI(`/gsm/get-models-by-brandname/${encodeURIComponent(brand)}`);

        if (data && Array.isArray(data)) {
            // Extract the model strings from the objects
            const models = data.map(item => item.modelValue).filter(Boolean);

            if (models.length > 0) {
                // The API seems to append newer phones to the end of the list.
                // We reverse the array so the newest models are at the top,
                // and keep up to 200 models per brand to be safe.
                updatedData[brand] = models.reverse().slice(0, 200);
                hasUpdates = true;
                console.log(`✅ Successfully synced ${updatedData[brand].length} models for ${brand}`);
            } else {
                console.warn(`⚠️ No models returned for ${brand}`);
            }
        } else {
            console.error(`❌ Failed to fetch data for ${brand}`);
        }
    }

    if (hasUpdates) {
        // Write back to file system
        fs.writeFileSync(jsonPath, JSON.stringify(updatedData, null, 2));
        console.log(`\n💾 Saved updated list to ${jsonPath}`);
    } else {
        console.log(`\n⚠️ Sync finished but no new data was fetched. Check API key limits.`);
    }
}

syncSmartphones();
