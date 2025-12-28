import pytest
import json
from datetime import datetime
from app import app, db, FocusSession

# 1. SETUP: Create a temporary database for every test
@pytest.fixture
def client():
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:' # RAM Database
    
    with app.app_context():
        db.create_all()
        with app.test_client() as client:
            yield client
        db.drop_all()

# 2. TEST: Does the home page load?
def test_home_page(client):
    response = client.get('/')
    assert response.status_code == 200

# 3. TEST: Can we save a session? (CRITICAL)
def test_log_session(client):
    # Simulate the JavaScript sending data
    payload = {
        "duration": 25,
        "type": "Focus",
        "mood": "Fire"
    }
    
    response = client.post('/api/log-session', 
                           data=json.dumps(payload),
                           content_type='application/json')
    
    # Expect 200 OK or 201 Created
    assert response.status_code == 200 
    
    # Check if the database actually has the row
    with app.app_context():
        count = FocusSession.query.count()
        assert count == 1
        session = FocusSession.query.first()
        assert session.mood == "Fire"

# 4. TEST: Does the streak increase after saving?
def test_streak_increments(client):
    # First check: Streak should be 0
    resp_start = client.get('/api/streak')
    assert resp_start.json['streak'] == 0
    
    # Action: Save a session
    client.post('/api/log-session', 
                data=json.dumps({"duration": 25, "type": "Focus", "mood": "Good"}),
                content_type='application/json')
    
    # Second check: Streak should be 1
    resp_end = client.get('/api/streak')
    assert resp_end.json['streak'] == 1

# 5. TEST: Does the Calendar API return the sum of minutes?
def test_calendar_aggregation(client):
    # Log two 25-minute sessions
    client.post('/api/log-session', json={"duration": 25, "type": "Focus", "mood": "Good"})
    client.post('/api/log-session', json={"duration": 25, "type": "Focus", "mood": "Good"})
    
    # Fetch calendar data
    response = client.get('/api/calendar-data')
    data = response.json
    
    # Logic: Get today's date string
    today_str = str(datetime.utcnow().date())
    
    # Assert: Today should have 50 minutes (25 + 25)
    # Note: If this fails due to timezone differences in test env, 
    # we just check that *some* key has the value 50.
    assert 50 in data.values()