import os
from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from sqlalchemy import func

app = Flask(__name__)

# --- CONFIGURATION ---
# Forces the database to live in the same folder as this script
basedir = os.path.abspath(os.path.dirname(__file__))
db_path = os.path.join(basedir, 'focusmate.db')
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# --- DATABASE MODEL ---
class FocusSession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    duration_minutes = db.Column(db.Integer, nullable=False)
    session_type = db.Column(db.String(50), nullable=False) # 'Focus' or 'Break'
    mood = db.Column(db.String(20), nullable=True) # 'Focused', 'Bored', 'Anxious'
    completed = db.Column(db.Boolean, default=False)
    timestamp = db.Column(db.DateTime, default=datetime.now) # Defaults to Now

# --- ROUTES ---

@app.route('/')
def home():
    return render_template('index.html')

# 1. Log Session (Clean Version)
@app.route('/api/log-session', methods=['POST'])
def log_session():
    data = request.get_json()
    
    new_session = FocusSession(
        duration_minutes=data.get('duration', 25),
        session_type=data.get('type', 'Focus'),
        mood=data.get('mood', 'Good'),
        completed=True
        # timestamp is automatically set to datetime.now() by the DB Model
    )
    
    try:
        db.session.add(new_session)
        db.session.commit()
        return jsonify({"message": "Saved", "id": new_session.id})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# 2. Get Bar Chart Data
@app.route('/api/stats')
def get_stats():
    stats = db.session.query(
        func.date(FocusSession.timestamp), 
        func.sum(FocusSession.duration_minutes)
    ).filter_by(completed=True).group_by(func.date(FocusSession.timestamp)).all()
    
    dates = [str(d) for d, m in stats]
    minutes = [m for d, m in stats]
    return jsonify({"labels": dates, "data": minutes})

# 3. Get Mood Distribution
@app.route('/api/mood-stats')
def get_mood_stats():
    results = db.session.query(
        FocusSession.mood, func.count(FocusSession.mood)
    ).filter_by(completed=True).group_by(FocusSession.mood).all()
    
    data = {"Focused": 0, "Bored": 0, "Anxious": 0}
    for mood, count in results:
        if mood in data:
            data[mood] = count
    return jsonify(data)

# 4. Get Calendar Heatmap Data
@app.route('/api/calendar-data')
def get_calendar_data():
    results = db.session.query(
        func.date(FocusSession.timestamp),
        func.sum(FocusSession.duration_minutes)
    ).filter_by(completed=True).group_by(func.date(FocusSession.timestamp)).all()
    
    data = {}
    for date_str, mins in results:
        data[str(date_str)] = mins
    return jsonify(data)

# 5. Smart Streak Logic (Consecutive Days)
@app.route('/api/streak')
def get_streak():
    # Get all unique dates worked, ordered newest to oldest
    dates = db.session.query(func.date(FocusSession.timestamp))\
        .filter_by(completed=True)\
        .group_by(func.date(FocusSession.timestamp))\
        .order_by(func.date(FocusSession.timestamp).desc())\
        .all()
    
    if not dates:
        return jsonify({"streak": 0})

    clean_dates = [datetime.strptime(str(d[0]), '%Y-%m-%d').date() for d in dates]

    # Check if streak is alive (Worked Today or Yesterday?)
    today = datetime.now().date()
    last_worked = clean_dates[0]
    gap_from_today = (today - last_worked).days
    
    if gap_from_today > 1:
        return jsonify({"streak": 0})

    # Count consecutive days
    current_streak = 1
    for i in range(len(clean_dates) - 1):
        gap = (clean_dates[i] - clean_dates[i+1]).days
        if gap == 1:
            current_streak += 1
        elif gap == 0:
            continue
        else:
            break

    return jsonify({"streak": current_streak})

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        print(f"📂 Database Active at: {db_path}")
    app.run(debug=True)
    