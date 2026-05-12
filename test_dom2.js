const { JSDOM } = require('jsdom');
const dom = new JSDOM(`<body><div class="nav-link" onclick="switchTab('create_exam', true)"></div></body>`);
const document = dom.window.document;

try {
    const link = document.querySelector(`.nav-link[onclick="switchTab('create_exam')"]`);
    console.log("Selector worked, link is:", link ? "FOUND" : "NULL");
} catch(e) {
    console.log("Selector threw error:", e.message);
}
