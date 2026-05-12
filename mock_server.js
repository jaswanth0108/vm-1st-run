const express = require('express');
const app = express();
const cors = require('cors');

app.use(cors());

app.get('/api/exams', (req, res) => {
    res.json([{
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
    }]);
});

app.listen(3001, () => {
    console.log("Mock server running on 3001");
});
