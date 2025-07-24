from flask import Flask, render_template, request, jsonify, redirect, url_for
import sqlite3
import json
from datetime import datetime, timedelta
import os

app = Flask(__name__)

# Database initialization
def init_db():
    conn = sqlite3.connect('nzc_activator.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            school_name TEXT NOT NULL,
            session_type TEXT NOT NULL,
            location TEXT NOT NULL,
            activator TEXT NOT NULL,
            year_group TEXT NOT NULL,
            male_participants INTEGER NOT NULL,
            female_participants INTEGER NOT NULL,
            teacher_feedback TEXT,
            session_date DATE NOT NULL,
            date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
            latitude REAL,
            longitude REAL,
            photo_path TEXT
        )
    ''')
    
    # Insert sample data if table is empty
    cursor.execute('SELECT COUNT(*) FROM sessions')
    if cursor.fetchone()[0] == 0:
        sample_sessions = [
            ('Auckland Primary School', 'Community Event', 'School Hall', 'John Smith', 'Year 5-6', 8, 9, 'Great engagement from students', '2025-01-16', '2025-01-16 10:00:00'),
            ('Wellington High School', 'Workshop', 'Gymnasium', 'Sarah Johnson', 'Year 7-8', 65, 62, 'Excellent participation', '2025-01-16', '2025-01-16 14:00:00'),
            ('Christchurch College', 'Club Training', 'Sports Field', 'Mike Wilson', 'Year 9-10', 15, 13, 'Good skill development', '2025-01-16', '2025-01-16 16:00:00'),
            ('Hamilton Elementary', 'Community Event', 'Community Center', 'Lisa Brown', 'Year 3-4', 12, 15, 'Very enthusiastic group', '2025-01-15', '2025-01-15 11:00:00'),
            ('Dunedin Academy', 'Workshop', 'Main Hall', 'David Lee', 'Year 6-7', 20, 18, 'Positive feedback', '2025-01-15', '2025-01-15 13:00:00'),
        ]
        
        cursor.executemany('''
            INSERT INTO sessions (school_name, session_type, location, activator, year_group, male_participants, female_participants, teacher_feedback, session_date, date_created)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', sample_sessions)
    
    conn.commit()
    conn.close()

# Routes
@app.route('/')
def home():
    return render_template('index.html')

@app.route('/record')
def record_session():
    return render_template('record.html')

@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

@app.route('/sessions')
def sessions():
    return render_template('sessions.html')

@app.route('/success')
def success():
    return render_template('success.html')

# API Routes
@app.route('/api/sessions', methods=['GET'])
def get_sessions():
    conn = sqlite3.connect('nzc_activator.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT id, school_name, session_type, location, activator, year_group, 
               male_participants, female_participants, teacher_feedback, session_date, date_created
        FROM sessions 
        ORDER BY session_date DESC, date_created DESC
    ''')
    
    sessions = []
    for row in cursor.fetchall():
        sessions.append({
            'id': row[0],
            'school_name': row[1],
            'session_type': row[2],
            'location': row[3],
            'activator': row[4],
            'year_group': row[5],
            'male_participants': row[6],
            'female_participants': row[7],
            'teacher_feedback': row[8],
            'session_date': row[9],
            'date_created': row[10],
            'total_participants': row[6] + row[7]
        })
    
    conn.close()
    return jsonify(sessions)

@app.route('/api/sessions', methods=['POST'])
def create_session():
    data = request.json
    
    conn = sqlite3.connect('nzc_activator.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT INTO sessions (school_name, session_type, location, activator, year_group, 
                            male_participants, female_participants, teacher_feedback, session_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        data['school_name'],
        data['session_type'],
        data['location'],
        data['activator'],
        data['year_group'],
        int(data['male_participants']),
        int(data['female_participants']),
        data['teacher_feedback'],
        data['session_date']
    ))
    
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'message': 'Session recorded successfully'})

@app.route('/api/sessions/<int:session_id>', methods=['PUT'])
def update_session(session_id):
    data = request.json
    
    conn = sqlite3.connect('nzc_activator.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        UPDATE sessions 
        SET school_name=?, session_type=?, location=?, activator=?, year_group=?, 
            male_participants=?, female_participants=?, teacher_feedback=?, session_date=?
        WHERE id=?
    ''', (
        data['school_name'],
        data['session_type'],
        data['location'],
        data['activator'],
        data['year_group'],
        int(data['male_participants']),
        int(data['female_participants']),
        data['teacher_feedback'],
        data['session_date'],
        session_id
    ))
    
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'message': 'Session updated successfully'})

@app.route('/api/sessions/<int:session_id>', methods=['DELETE'])
def delete_session(session_id):
    conn = sqlite3.connect('nzc_activator.db')
    cursor = conn.cursor()
    
    cursor.execute('DELETE FROM sessions WHERE id = ?', (session_id,))
    
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'message': 'Session deleted successfully'})

@app.route('/api/stats')
def get_stats():
    conn = sqlite3.connect('nzc_activator.db')
    cursor = conn.cursor()
    
    # Get total participants in last 7 days
    seven_days_ago = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
    cursor.execute('''
        SELECT SUM(male_participants + female_participants) 
        FROM sessions 
        WHERE session_date >= ?
    ''', (seven_days_ago,))
    
    recent_participants = cursor.fetchone()[0] or 0
    
    # Get daily participation for last 7 days
    daily_stats = []
    for i in range(7):
        date = (datetime.now() - timedelta(days=6-i)).strftime('%Y-%m-%d')
        cursor.execute('''
            SELECT SUM(male_participants + female_participants) 
            FROM sessions 
            WHERE session_date = ?
        ''', (date,))
        
        participants = cursor.fetchone()[0] or 0
        daily_stats.append({
            'date': date,
            'participants': participants,
            'day': (datetime.now() - timedelta(days=6-i)).strftime('%a')
        })
    
    conn.close()
    
    return jsonify({
        'recent_participants': recent_participants,
        'daily_stats': daily_stats
    })

if __name__ == '__main__':
    init_db()
    app.run(debug=True)
