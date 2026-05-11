const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());

// ===================================
// CONFIG
// ===================================
const PORT = process.env.PORT || 3000;
const JWT_SECRET = "sia2024-progression-secret";
const API_KEY = "main-system-integration-key";

// ===================================
// IN-MEMORY STORAGE
// ===================================
const users = new Map();

// ===================================
// AUTH MIDDLEWARE
// ===================================

// JWT for users
function verifyToken(req, res, next) {
    const token = req.headers["authorization"]?.replace("Bearer ", "");
    if (!token) return res.status(403).json({ error: "No token provided" });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: "Invalid token" });
        req.user = decoded;
        next();
    });
}

// API Key for service-to-service
function verifyApiKey(req, res, next) {
    const key = req.headers["x-api-key"];
    if (key !== API_KEY) return res.status(401).json({ error: "Invalid API key" });
    next();
}

// ===================================
// XP SYSTEM
// ===================================
const getXPForLevel = (level) => Math.floor(100 * Math.pow(1.3, level - 1));

function addXP(user, amount) {
    let xpAdded = amount;
    let levelsGained = 0;

    while (xpAdded > 0) {
        const needed = getXPForLevel(user.level);
        if (user.xp + xpAdded >= needed) {
            xpAdded -= (needed - user.xp);
            user.xp = 0;
            user.level++;
            levelsGained++;
        } else {
            user.xp += xpAdded;
            xpAdded = 0;
        }
    }

    return {
        level: user.level,
        xp: user.xp,
        xpNeeded: getXPForLevel(user.level),
        levelsGained
    };
}

// ===================================
// PUBLIC ROUTES
// ===================================

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        service: "progression-service",
        timestamp: new Date(),
        storage: "in-memory"
    });
});

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Progression Service Running",
        version: "1.0.0",
        storage: "in-memory (data resets on restart)"
    });
});

// Login
app.post("/auth/login", (req, res) => {
    const { userId, username } = req.body;
    if (!userId || !username) return res.status(400).json({ error: "userId and username required" });

    let user = users.get(userId);
    if (!user) {
        user = {
            userId,
            username,
            level: 1,
            xp: 0,
            totalLessons: 0,
            totalQuizzes: 0,
            quizScoreSum: 0,
            avgQuizScore: 0,
            createdAt: new Date()
        };
        users.set(userId, user);
    }

    const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user });
});

// ===================================
// USER ROUTES (JWT Protected)
// ===================================

app.get("/users/me", verifyToken, (req, res) => {
    const user = users.get(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const xpNeeded = getXPForLevel(user.level);
    res.json({
        ...user,
        xpNeeded,
        progressPercent: Math.floor((user.xp / xpNeeded) * 100)
    });
});

app.post("/users/me/lessons/complete", verifyToken, (req, res) => {
    const user = users.get(req.user.userId);
    user.totalLessons++;
    const xpGained = 50;
    const result = addXP(user, xpGained);

    res.json({
        message: "Lesson completed",
        xpGained,
        totalLessons: user.totalLessons,
        ...result
    });
});

app.post("/users/me/quizzes/submit", verifyToken, (req, res) => {
    const { score, maxScore } = req.body;
    if (!score || !maxScore) return res.status(400).json({ error: "score and maxScore required" });

    const user = users.get(req.user.userId);
    const percentage = (score / maxScore) * 100;

    user.totalQuizzes++;
    user.quizScoreSum += percentage;
    user.avgQuizScore = user.quizScoreSum / user.totalQuizzes;

    const baseXP = 30;
    const scoreBonus = Math.floor((percentage / 100) * 70);
    const xpGained = baseXP + scoreBonus;

    const result = addXP(user, xpGained);

    res.json({
        message: `Quiz: ${percentage.toFixed(0)}%`,
        xpGained,
        scoreBonus,
        totalQuizzes: user.totalQuizzes,
        avgQuizScore: user.avgQuizScore.toFixed(1),
        ...result
    });
});

// ===================================
// WEBHOOKS (API Key - For Your Main System)
// ===================================

app.post("/webhook/lesson-complete", verifyApiKey, (req, res) => {
    const { userId, username, lessonId } = req.body;
    if (!userId || !lessonId) return res.status(400).json({ error: "userId and lessonId required" });

    let user = users.get(userId);
    if (!user) {
        if (!username) return res.status(400).json({ error: "username required for new user" });
        user = {
            userId,
            username,
            level: 1,
            xp: 0,
            totalLessons: 0,
            totalQuizzes: 0,
            quizScoreSum: 0,
            avgQuizScore: 0,
            createdAt: new Date()
        };
        users.set(userId, user);
    }

    user.totalLessons++;
    const xpGained = 50;
    const result = addXP(user, xpGained);

    res.json({
        success: true,
        message: "Lesson progress recorded",
        userId,
        lessonId,
        xpGained,
        ...result
    });
});

app.post("/webhook/quiz-submit", verifyApiKey, (req, res) => {
    const { userId, username, quizId, score, maxScore } = req.body;
    if (!userId || !quizId || !score || !maxScore) {
        return res.status(400).json({ error: "userId, quizId, score, maxScore required" });
    }

    let user = users.get(userId);
    if (!user) {
        if (!username) return res.status(400).json({ error: "username required for new user" });
        user = {
            userId,
            username,
            level: 1,
            xp: 0,
            totalLessons: 0,
            totalQuizzes: 0,
            quizScoreSum: 0,
            avgQuizScore: 0,
            createdAt: new Date()
        };
        users.set(userId, user);
    }

    const percentage = (score / maxScore) * 100;
    user.totalQuizzes++;
    user.quizScoreSum += percentage;
    user.avgQuizScore = user.quizScoreSum / user.totalQuizzes;

    const baseXP = 30;
    const scoreBonus = Math.floor((percentage / 100) * 70);
    const xpGained = baseXP + scoreBonus;

    const result = addXP(user, xpGained);

    res.json({
        success: true,
        message: "Quiz progress recorded",
        userId,
        quizId,
        score: percentage.toFixed(1) + "%",
        xpGained,
        scoreBonus,
        ...result
    });
});

// Get any user
app.get("/users/:userId", verifyApiKey, (req, res) => {
    const user = users.get(req.params.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const xpNeeded = getXPForLevel(user.level);
    res.json({
        ...user,
        xpNeeded,
        progressPercent: Math.floor((user.xp / xpNeeded) * 100)
    });
});

// Leaderboard
app.get("/leaderboard", (req, res) => {
    const { limit = 10 } = req.query;
    const allUsers = Array.from(users.values())
        .sort((a, b) => {
            if (b.level !== a.level) return b.level - a.level;
            return b.xp - a.xp;
        })
        .slice(0, parseInt(limit));

    res.json({
        leaderboard: allUsers.map((u, i) => ({
            position: i + 1,
            userId: u.userId,
            username: u.username,
            level: u.level,
            xp: u.xp,
            totalLessons: u.totalLessons,
            totalQuizzes: u.totalQuizzes,
            avgQuizScore: u.avgQuizScore.toFixed(1)
        }))
    });
});

// ===================================
// ERROR HANDLER
// ===================================
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: "Something went wrong!" });
});

// ===================================
// START
// ===================================
app.listen(PORT, () => {
    console.log(`🚀 Progression Service on port ${PORT}`);
    console.log(`💾 In-memory storage (resets on restart)`);
    console.log(`🔑 API Key for webhooks: ${API_KEY}`);
});