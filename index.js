const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

/*
===================================
TEST ROUTE
===================================
*/
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Notification Service Running"
    });
});

/*
===================================
SEND NOTIFICATION
===================================
*/
app.post("/notify", (req, res) => {

    const { userId, title, message } = req.body;

    // Validation
    if (!userId || !title || !message) {
        return res.status(400).json({
            success: false,
            message: "Missing required fields"
        });
    }

    // Fake notification storage
    const notification = {
        userId,
        title,
        message,
        createdAt: new Date()
    };

    console.log("NEW NOTIFICATION:");
    console.log(notification);

    // Response
    res.json({
        success: true,
        message: "Notification sent successfully",
        data: notification
    });

});

/*
===================================
PORT
===================================
*/
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});