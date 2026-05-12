const { chromium } = require('playwright');
const express = require('express');
const path = require('path');

const app = express();
app.use(express.static(__dirname));
const server = app.listen(3002, async () => {
    console.log("Serving static on 3002");
    
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push('PAGE_ERROR: ' + err.message));
    page.on('console', msg => {
        if (msg.type() === 'error') {
            errors.push('CONSOLE_ERROR: ' + msg.text());
        }
    });

    // Mock the API requests to avoid Postgres issues
    await page.route('**/api/exams', async route => {
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([{
                    id: "exam_mock_123",
                    title: "Mock Exam",
                    subject: "Test",
                    branch: ["All"],
                    batch: ["All"],
                    duration: 60,
                    questions: [{
                        id: "q_1",
                        type: "text",
                        text: "Hello",
                        options: ["1","2","3","4"],
                        correct: "1"
                    }]
                }])
            });
        } else {
            await route.continue();
        }
    });

    await page.goto('http://localhost:3002/admin/index.html');
    
    // login
    await page.waitForSelector('input[placeholder="Username"]', { timeout: 5000 }).catch(() => {});
    const userInput = await page.$('input[placeholder="Username"]');
    if (userInput) {
        await page.fill('input[placeholder="Username"]', 'admin');
        await page.fill('input[placeholder="Password"]', 'Vm@cse5');
        await page.evaluate(() => {
            // Mock auth token
            localStorage.setItem('college_exam_portal_token', 'mock_token');
            localStorage.setItem('ems_session', JSON.stringify({ role: 'admin', name: 'Admin' }));
        });
        await page.reload();
    }

    // Wait for dashboard to load
    await page.waitForTimeout(2000);

    // Call triggerAction programmatically
    const result = await page.evaluate(async () => {
        try {
            const exams = await window.ExamService.getExams();
            if (exams.length === 0) return "No exams to edit";
            
            // open modal
            window.openActionModal(exams[0].id);
            
            // trigger edit
            await window.triggerAction('edit');
            
            return "Edit triggered successfully";
        } catch(e) {
            return "ERROR_THROWN: " + e.message + "\\n" + e.stack;
        }
    });

    console.log("Evaluation Result:", result);
    console.log("Errors logged:", errors);
    
    const isActive = await page.evaluate(() => {
        const tab = document.getElementById('tab-create_exam');
        return tab ? tab.classList.contains('active') : false;
    });

    console.log("Is Create Exam tab active?", isActive);

    await browser.close();
    server.close();
});
