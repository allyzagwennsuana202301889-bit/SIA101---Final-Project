const API_BASE = 'https://sia101-final-project.onrender.com';
        let token = localStorage.getItem('sia101_token');
        let userId = localStorage.getItem('sia101_userId');
        let username = localStorage.getItem('sia101_username');
        let currentUser = null;

        // Defensive helper: safely format any avgQuizScore value
        function safeAvg(val) {
            const n = parseFloat(val);
            return isNaN(n) ? '0.0' : n.toFixed(1);
        }

        // Check for existing session
        if (token && userId) {
            showDashboard();
            refreshData();
        }

        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            userId = document.getElementById('user-id').value.trim();
            username = document.getElementById('username').value.trim();
            
            try {
                const res = await fetch(`${API_BASE}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, username })
                });
                const data = await res.json();
                if (data.token) {
                    token = data.token;
                    localStorage.setItem('sia101_token', token);
                    localStorage.setItem('sia101_userId', userId);
                    localStorage.setItem('sia101_username', username);
                    showDashboard();
                    refreshData();
                    showToast('success', 'Welcome!', `Logged in as ${username}`);
                } else {
                    showToast('error', 'Login Failed', data.error || 'Unknown error');
                }
            } catch (err) {
                showToast('error', 'Connection Error', 'Could not reach the server');
            }
        });

        async function api(endpoint, options = {}) {
            const headers = {
                'Content-Type': 'application/json',
                ...options.headers
            };
            if (token) headers['Authorization'] = `Bearer ${token}`;
            
            const res = await fetch(`${API_BASE}${endpoint}`, {
                ...options,
                headers
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Request failed' }));
                throw new Error(err.error || `HTTP ${res.status}`);
            }
            return res.json();
        }

        function showDashboard() {
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('dashboard').classList.remove('hidden');
            document.getElementById('header-username').textContent = username;
            document.getElementById('user-avatar').textContent = username.charAt(0).toUpperCase();
        }

        async function refreshData() {
            const icon = document.getElementById('refresh-icon');
            icon.classList.add('fa-spin');
            try {
                currentUser = await api('/users/me');
                updateUI(currentUser);
            } catch (err) {
                if (err.message.includes('Invalid token')) {
                    logout();
                    showToast('error', 'Session Expired', 'Please log in again');
                } else {
                    showToast('error', 'Error', err.message);
                }
            } finally {
                setTimeout(() => icon.classList.remove('fa-spin'), 500);
            }
        }

        function updateUI(user) {
            document.getElementById('level-num').textContent = user.level;
            document.getElementById('display-level').textContent = user.level;
            document.getElementById('header-level').textContent = user.level;
            
            const titles = ['Beginner', 'Learner', 'Student', 'Scholar', 'Expert', 'Master', 'Grandmaster', 'Legend'];
            document.getElementById('level-title').textContent = titles[Math.min(user.level - 1, titles.length - 1)] || 'Mythic';

            document.getElementById('current-xp').textContent = user.xp;
            document.getElementById('needed-xp').textContent = user.xpNeeded;
            document.getElementById('progress-percent').textContent = user.progressPercent;
            document.getElementById('xp-bar').style.width = `${user.progressPercent}%`;

            document.getElementById('total-lessons').textContent = user.totalLessons;
            document.getElementById('total-quizzes').textContent = user.totalQuizzes;
            
            // FIXED: use safeAvg helper
            document.getElementById('avg-score').textContent = safeAvg(user.avgQuizScore) + '%';

            updateLeaderboardPosition();
        }

        async function updateLeaderboardPosition() {
            try {
                const data = await api('/leaderboard?limit=100');
                const pos = data.leaderboard.findIndex(u => u.userId === userId);
                document.getElementById('leaderboard-pos').textContent = pos >= 0 ? `#${pos + 1}` : '-';
            } catch (e) {
                document.getElementById('leaderboard-pos').textContent = '-';
            }
        }

        async function simulateLesson() {
            try {
                const data = await api('/users/me/lessons/complete', { method: 'POST' });
                updateUI({ ...currentUser, ...data });
                
                let msg = `+${data.xpGained} XP`;
                if (data.levelsGained > 0) {
                    msg += ` • Level Up! 🎉`;
                    triggerLevelUp();
                }
                addActivity('lesson', `Completed Lesson #${data.totalLessons}`, msg);
                showToast('success', 'Lesson Complete!', msg);
            } catch (err) {
                showToast('error', 'Error', err.message);
            }
        }

        function openQuizModal() {
            document.getElementById('quiz-modal').classList.remove('hidden');
            document.getElementById('quiz-score').focus();
        }

        function closeQuizModal() {
            document.getElementById('quiz-modal').classList.add('hidden');
            document.getElementById('quiz-form').reset();
        }

        document.getElementById('quiz-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const score = parseFloat(document.getElementById('quiz-score').value);
            const maxScore = parseFloat(document.getElementById('quiz-max').value);
            
            try {
                const data = await api('/users/me/quizzes/submit', {
                    method: 'POST',
                    body: JSON.stringify({ score, maxScore })
                });
                updateUI({ ...currentUser, ...data });
                
                let msg = `+${data.xpGained} XP (${data.scoreBonus} bonus)`;
                if (data.levelsGained > 0) {
                    msg += ` • Level Up! 🎉`;
                    triggerLevelUp();
                }
                addActivity('quiz', `Quiz: ${(score/maxScore*100).toFixed(0)}%`, msg);
                showToast('success', 'Quiz Submitted!', msg);
                closeQuizModal();
            } catch (err) {
                showToast('error', 'Error', err.message);
            }
        });

        async function loadLeaderboard() {
            document.getElementById('leaderboard-modal').classList.remove('hidden');
            try {
                const data = await api('/leaderboard?limit=50');
                const list = document.getElementById('leaderboard-list');
                
                if (data.leaderboard.length === 0) {
                    list.innerHTML = '<div class="text-center text-gray-500 py-8">No players yet</div>';
                    return;
                }

                list.innerHTML = data.leaderboard.map((u, i) => {
                    const isMe = u.userId === userId;
                    const medals = ['🥇', '🥈', '🥉'];
                    const rank = i < 3 ? medals[i] : `#${i + 1}`;
                    // FIXED: use safeAvg helper
                    const avg = safeAvg(u.avgQuizScore);
                    return `
                        <div class="flex items-center gap-3 p-3 rounded-lg ${isMe ? 'bg-purple-500/20 border border-purple-500/30' : 'bg-gray-800/50'}">
                            <div class="w-8 text-center font-bold ${i < 3 ? 'text-yellow-400' : 'text-gray-500'}">${rank}</div>
                            <div class="w-8 h-8 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center text-sm font-bold">${u.username.charAt(0).toUpperCase()}</div>
                            <div class="flex-1">
                                <div class="font-medium ${isMe ? 'text-purple-400' : ''}">${u.username} ${isMe ? '(You)' : ''}</div>
                                <div class="text-xs text-gray-500">Level ${u.level} • ${u.xp} XP • Avg: ${avg}%</div>
                            </div>
                            <div class="text-right text-sm">
                                <div class="text-gray-400">${u.totalLessons} <i class="fas fa-book text-xs"></i></div>
                                <div class="text-gray-400">${u.totalQuizzes} <i class="fas fa-question text-xs"></i></div>
                            </div>
                        </div>
                    `;
                }).join('');
            } catch (err) {
                document.getElementById('leaderboard-list').innerHTML = `<div class="text-center text-red-400 py-8">${err.message}</div>`;
            }
        }

        function closeLeaderboard() {
            document.getElementById('leaderboard-modal').classList.add('hidden');
        }

        function triggerLevelUp() {
            const badge = document.getElementById('level-badge');
            const effect = document.getElementById('level-up-effect');
            badge.classList.add('level-up-anim');
            effect.classList.remove('hidden');
            effect.classList.add('pulse-ring');
            setTimeout(() => {
                badge.classList.remove('level-up-anim');
                effect.classList.add('hidden');
                effect.classList.remove('pulse-ring');
            }, 2000);
        }

        function addActivity(type, title, detail) {
            const log = document.getElementById('activity-log');
            const empty = log.querySelector('.text-center');
            if (empty) empty.remove();
            
            const icons = { lesson: 'fa-book-open text-green-400', quiz: 'fa-question-circle text-yellow-400' };
            const item = document.createElement('div');
            item.className = 'flex items-center gap-3 p-3 rounded-lg bg-gray-800/30 slide-up';
            item.innerHTML = `
                <div class="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center">
                    <i class="fas ${icons[type] || 'fa-star'}"></i>
                </div>
                <div class="flex-1">
                    <div class="font-medium text-sm">${title}</div>
                    <div class="text-xs text-gray-500">${detail}</div>
                </div>
                <div class="text-xs text-gray-600">${new Date().toLocaleTimeString()}</div>
            `;
            log.insertBefore(item, log.firstChild);
        }

        function showToast(type, title, message) {
            const toast = document.getElementById('toast');
            const iconDiv = document.getElementById('toast-icon');
            const titleDiv = document.getElementById('toast-title');
            const msgDiv = document.getElementById('toast-message');
            
            const colors = {
                success: 'bg-green-500 text-white',
                error: 'bg-red-500 text-white',
                info: 'bg-blue-500 text-white'
            };
            const icons = {
                success: 'fa-check',
                error: 'fa-exclamation',
                info: 'fa-info'
            };
            
            iconDiv.className = `w-8 h-8 rounded-full flex items-center justify-center ${colors[type]}`;
            iconDiv.innerHTML = `<i class="fas ${icons[type]}"></i>`;
            titleDiv.textContent = title;
            msgDiv.textContent = message;
            
            toast.classList.remove('translate-y-20', 'opacity-0');
            setTimeout(() => {
                toast.classList.add('translate-y-20', 'opacity-0');
            }, 4000);
        }

        async function testConnection() {
            const status = document.getElementById('connection-status');
            status.textContent = 'Testing...';
            status.className = 'text-yellow-400';
            
            try {
                const res = await fetch(`${API_BASE}/health`);
                const data = await res.json();
                status.textContent = 'Online ✓';
                status.className = 'text-green-400';
                showToast('success', 'Connected', `Service: ${data.service}`);
            } catch (err) {
                status.textContent = 'Offline ✗';
                status.className = 'text-red-400';
                showToast('error', 'Offline', 'Cannot reach the server');
            }
        }

        function logout() {
            token = null;
            userId = null;
            username = null;
            localStorage.removeItem('sia101_token');
            localStorage.removeItem('sia101_userId');
            localStorage.removeItem('sia101_username');
            document.getElementById('dashboard').classList.add('hidden');
            document.getElementById('login-screen').classList.remove('hidden');
            document.getElementById('login-form').reset();
        }

        // Close modals on backdrop click
        document.getElementById('quiz-modal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeQuizModal();
        });
        document.getElementById('leaderboard-modal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeLeaderboard();
        });