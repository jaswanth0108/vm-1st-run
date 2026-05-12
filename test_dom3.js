const { JSDOM } = require('jsdom');
const fs = require('fs');

const html = fs.readFileSync('admin/index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: "dangerously" });
const window = dom.window;
const document = window.document;

// Mock alert
window.alert = console.log;

try {
    // Set up active tab to dashboard
    document.getElementById('tab-dashboard').classList.add('active');
    
    // Create dummy exam
    window.editingExamId = "123";
    
    // Run switchTab
    window.switchTab('create_exam');
    
    // Check results
    console.log("Is dashboard active?", document.getElementById('tab-dashboard').classList.contains('active'));
    console.log("Is create_exam active?", document.getElementById('tab-create_exam').classList.contains('active'));
    
    const h2El = document.querySelector('#tab-create_exam h2');
    console.log("H2 Text:", h2El ? h2El.textContent : "null");

} catch(e) {
    console.log("ERROR:", e.message);
    console.log(e.stack);
}
