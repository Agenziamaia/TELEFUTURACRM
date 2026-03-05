const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "2fbe8e9f5bmsh62b3b6b84b12261p1f0690jsn7a2262eb7dce";

async function checkApi() {
    const url = 'https://mobile-phone-specs-database.p.rapidapi.com/gsm/get-models-by-brandname/Apple';
    const options = {
        method: 'GET',
        headers: {
            'x-rapidapi-key': RAPIDAPI_KEY,
            'x-rapidapi-host': 'mobile-phone-specs-database.p.rapidapi.com'
        }
    };

    try {
        const response = await fetch(url, options);
        const data = await response.json();

        console.log(`Total Apple models: ${data.length}`);
        const models = data.map(item => item.modelValue).filter(Boolean);

        // Let's print the first 10, middle 10, and last 10 to see how it's sorted
        console.log("FIRST 5:", models.slice(0, 5).join(", "));
        console.log("LAST 5:", models.slice(-5).join(", "));

        // Let's explicitly look for iPhone 15 or 16
        const newIphones = models.filter(m => m.includes("iPhone 15") || m.includes("iPhone 16"));
        console.log("iPhone 15/16 found:", newIphones.length > 0 ? newIphones.join(", ") : "None");
    } catch (e) {
        console.error(e);
    }
}
checkApi();
