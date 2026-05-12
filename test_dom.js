const { JSDOM } = require('jsdom');
const dom = new JSDOM();
const document = dom.window.document;
try {
    const tabId = 'create_exam';
    document.querySelector(`.nav-link[onclick="switchTab('${tabId}')"]`);
    console.log('Valid');
} catch(e) {
    console.log("Error:", e.message);
}
