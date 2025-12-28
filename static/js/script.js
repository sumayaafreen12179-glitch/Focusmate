/* --- MODULE 1: TIMER LOGIC --- */
const Timer = {
    timeLeft: 25 * 60,
    timerId: null,
    currentMode: 'Focus',
    
    display: document.getElementById('time-display'),
    card: document.getElementById('timer-card'),
    startBtn: document.getElementById('btn-start'),
    pauseBtn: document.getElementById('btn-pause'),
    
    init: function() {
        this.updateDisplay();
        this.addEvents();
        this.fetchStreak(); 
        Stats.init();
        Calendar.init();
    },

    updateDisplay: function() {
        const m = Math.floor(this.timeLeft / 60);
        const s = this.timeLeft % 60;
        this.display.textContent = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        document.title = `${this.display.textContent} - FocusMate`;
    },

    start: function() {
        if(this.timerId) return;
        
        this.card.classList.add('timer-active');
        this.startBtn.disabled = true;
        this.pauseBtn.disabled = false;

        this.timerId = setInterval(() => {
            this.timeLeft--;
            this.updateDisplay();
            
            if (this.timeLeft <= 0) {
                this.complete();
            }
        }, 1000);
    },

    pause: function() {
        clearInterval(this.timerId);
        this.timerId = null;
        this.card.classList.remove('timer-active');
        this.startBtn.disabled = false;
        this.pauseBtn.disabled = true;
    },

    reset: function() {
        this.pause();
        this.timeLeft = (this.currentMode === 'Focus') ? 25 * 60 : 5 * 60;
        this.updateDisplay();
        document.getElementById('mood-selector').style.display = 'none';
        document.querySelector('.controls').style.display = 'flex';
    },

    complete: function() {
        this.pause();
        if (this.currentMode === 'Focus') {
            document.getElementById('mood-selector').style.display = 'block';
            document.querySelector('.controls').style.display = 'none';
        } else {
            alert("Break finished!");
            this.switchMode('Focus', 25);
        }
    },

    switchMode: function(mode, minutes) {
        this.pause();
        this.currentMode = mode;
        this.timeLeft = minutes * 60;
        this.updateDisplay();
        
        document.querySelectorAll('.mode-btn').forEach(b => {
            b.classList.remove('active');
            if(b.textContent === mode) b.classList.add('active');
        });
    },

    logSession: function(mood) {
        const duration = (this.currentMode === 'Focus') ? 25 : 5;
        
        // Simple log: Backend uses current server time
        fetch('/api/log-session', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                duration: duration, 
                type: this.currentMode, 
                mood: mood 
            })
        }).then(() => {
            Stats.updateCharts();
            this.fetchStreak();
            Calendar.fetchData();
            setTimeout(() => { this.reset(); }, 1000);
        });
    },

    fetchStreak: function() {
        fetch('/api/streak?t=' + Date.now())
            .then(res => res.json())
            .then(data => {
                document.getElementById('streak-count').textContent = data.streak;
            });
    },

    addEvents: function() {
        this.startBtn.addEventListener('click', () => this.start());
        this.pauseBtn.addEventListener('click', () => this.pause());
        document.getElementById('btn-reset').addEventListener('click', () => this.reset());

        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.target.textContent;
                const time = parseInt(e.target.dataset.time);
                this.switchMode(mode, time);
            });
        });

        document.querySelectorAll('.btn-mood').forEach(b => {
            b.addEventListener('click', (e) => this.logSession(e.target.dataset.mood));
        });
    }
};

/* --- MODULE 2: CHARTS --- */
const Stats = {
    barChart: null, doughnutChart: null,
    init: function() { this.initBarChart(); this.initDoughnutChart(); this.updateCharts(); },

    initBarChart: function() {
        const ctx = document.getElementById('focusChart').getContext('2d');
        const gradient = ctx.createLinearGradient(0,0,0,300);
        gradient.addColorStop(0, '#00f260'); gradient.addColorStop(1, '#0575E6');

        this.barChart = new Chart(ctx, {
            type: 'bar',
            data: { labels: [], datasets: [{ label: 'Minutes', data: [], backgroundColor: gradient, borderRadius: 6, barThickness: 25 }] },
            options: { 
                responsive: true, maintainAspectRatio: false,
                scales: { 
                    x: { grid: {display: false}, ticks: {color:'#888', font:{size:10}} }, 
                    y: { grid: {color:'rgba(255,255,255,0.05)'}, ticks: {color:'#888', font:{size:10}} } 
                },
                plugins: { legend: {display:false} }
            }
        });
    },

    initDoughnutChart: function() {
        const ctx = document.getElementById('moodChart').getContext('2d');
        this.doughnutChart = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: ['Focused', 'Bored', 'Anxious'], datasets: [{ data: [1,1,1], backgroundColor: ['#FF5733', '#4CAF50', '#888888'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: {position: 'right', labels: {color:'#fff', boxWidth: 10, font:{size:11}}} } }
        });
    },

    updateCharts: function() {
        fetch('/api/stats?t=' + Date.now()).then(r=>r.json()).then(data => {
            this.barChart.data.labels = data.labels; this.barChart.data.datasets[0].data = data.data; this.barChart.update();
        });
        fetch('/api/mood-stats?t=' + Date.now()).then(r=>r.json()).then(data => {
            const total = data.Fire + data.Good + data.Tough;
            if (total > 0) { this.doughnutChart.data.datasets[0].data = [data.Fire, data.Good, data.Tough]; this.doughnutChart.update(); }
        });
    }
};

/* --- MODULE 3: CALENDAR HEATMAP --- */
const Calendar = {
    init: function() { this.renderBase(); this.fetchData(); },

    renderBase: function() {
        const grid = document.getElementById('calendarGrid');
        grid.innerHTML = '';
        const now = new Date();
        document.getElementById('currentMonth').textContent = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        
        ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(d => {
            const el = document.createElement('div'); el.className = 'calendar-day-header'; el.textContent = d; grid.appendChild(el);
        });

        const firstDayIndex = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        for (let i = 0; i < firstDayIndex; i++) {
            const el = document.createElement('div'); el.className = 'calendar-day'; grid.appendChild(el);
        }

        for (let i = 1; i <= daysInMonth; i++) {
            const el = document.createElement('div');
            el.className = 'calendar-day';
            el.innerHTML = `<span class="day-date">${i}</span><span class="day-count"></span>`;
            const month = (now.getMonth() + 1).toString().padStart(2, '0');
            const day = i.toString().padStart(2, '0');
            el.dataset.date = `${now.getFullYear()}-${month}-${day}`;
            grid.appendChild(el);
        }
    },

    formatTime: function(totalMinutes) {
        if (totalMinutes < 60) return `${totalMinutes}m`;
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    },

    fetchData: function() {
        fetch('/api/calendar-data?t=' + Date.now()).then(res => res.json()).then(data => {
            Object.keys(data).forEach(dateStr => {
                const el = document.querySelector(`.calendar-day[data-date="${dateStr}"]`);
                if (el) {
                    const minutes = data[dateStr];
                    el.querySelector('.day-count').textContent = this.formatTime(minutes);
                    if (minutes >= 240) el.classList.add('level-4');
                    else if (minutes >= 120) el.classList.add('level-3');
                    else if (minutes >= 60) el.classList.add('level-2');
                    else el.classList.add('level-1');
                }
            });
        });
    }
};

document.addEventListener('DOMContentLoaded', () => Timer.init());