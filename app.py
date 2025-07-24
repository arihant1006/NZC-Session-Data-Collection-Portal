from flask import Flask, render_template, request, jsonify, redirect, url_for, send_from_directory
import sqlite3
import json
from datetime import datetime, timedelta
import os
import re
import uuid
from werkzeug.utils import secure_filename

app = Flask(__name__)

# Configuration
UPLOAD_FOLDER = 'uploads/photos'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB

# Ensure upload directory exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs('static/js', exist_ok=True)  # Ensure static/js directory exists

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Database initialization
def init_db():
    conn = sqlite3.connect('nzc_activator.db')
    cursor = conn.cursor()
    
    # Sessions table
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
            session_duration INTEGER,
            date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
            latitude REAL,
            longitude REAL
        )
    ''')
    
    # Session photos table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS session_photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            original_filename TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_size INTEGER,
            upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
        )
    ''')
    
    # Insert sample data if sessions table is empty
    cursor.execute('SELECT COUNT(*) FROM sessions')
    if cursor.fetchone()[0] == 0:
        sample_sessions = [
            ('Auckland Primary School', 'School Festive Day', 'School Hall', 'John Smith', 'Year 5-6', 8, 9, 'Great engagement from students', '2025-01-16', 60, '2025-01-16 10:00:00', -36.8485, 174.7633),
            ('Wellington High School', 'Community Hub Practice', 'Gymnasium', 'Sarah Johnson', 'Year 7-8', 65, 62, 'Excellent participation', '2025-01-16', 90, '2025-01-16 14:00:00', -41.2865, 174.7762),
            ('Christchurch College', 'Girl\'s Cricket Programme', 'Sports Field', 'Mike Wilson', 'Year 9-10', 15, 13, 'Good skill development', '2025-01-16', 45, '2025-01-16 16:00:00', -43.5321, 172.6362),
            ('Hamilton Elementary', 'Kiwi Cricket Skills Session', 'Community Center', 'Lisa Brown', 'Year 3-4', 12, 15, 'Very enthusiastic group', '2025-01-15', 75, '2025-01-15 11:00:00', -37.7870, 175.2793),
            ('Dunedin Academy', 'In2Cricket Taster', 'Main Hall', 'David Lee', 'Year 6-7', 20, 18, 'Positive feedback', '2025-01-15', 120, '2025-01-15 13:00:00', -45.8788, 170.5028),
        ]
        
        cursor.executemany('''
            INSERT INTO sessions (school_name, session_type, location, activator, year_group, male_participants, female_participants, teacher_feedback, session_date, session_duration, date_created, latitude, longitude)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', sample_sessions)
    
    conn.commit()
    conn.close()

# Validation functions
def validate_session_data(data):
    """Validate session data on server side"""
    errors = []
    
    # Required fields validation
    required_fields = ['school_name', 'session_type', 'location', 'activator', 'year_group', 
                      'male_participants', 'female_participants', 'session_date', 'session_duration']
    
    for field in required_fields:
        if not data.get(field) or str(data.get(field)).strip() == '':
            errors.append(f"{field.replace('_', ' ').title()} is required")
    
    # School name validation
    if data.get('school_name'):
        if len(data['school_name'].strip()) < 2:
            errors.append("School name must be at least 2 characters long")
        if len(data['school_name'].strip()) > 100:
            errors.append("School name must be less than 100 characters")
    
    # Session type validation
    if data.get('session_type'):
        if len(data['session_type'].strip()) < 2:
            errors.append("Session type must be at least 2 characters long")
        if len(data['session_type'].strip()) > 50:
            errors.append("Session type must be less than 50 characters")
    
    # Location validation
    if data.get('location'):
        if len(data['location'].strip()) < 2:
            errors.append("Location must be at least 2 characters long")
        if len(data['location'].strip()) > 100:
            errors.append("Location must be less than 100 characters")
    
    # Activator validation
    if data.get('activator'):
        if len(data['activator'].strip()) < 2:
            errors.append("Activator name must be at least 2 characters long")
        if len(data['activator'].strip()) > 50:
            errors.append("Activator name must be less than 50 characters")
        if not re.match(r'^[a-zA-Z\s\-\.]+$', data['activator'].strip()):
            errors.append("Activator name can only contain letters, spaces, hyphens, and periods")
    
    # Year group validation
    valid_year_groups = ['Year 1-2', 'Year 3-4', 'Year 5-6', 'Year 7-8', 'Year 9-10', 'Year 11-13', 'Mixed']
    if data.get('year_group') and data['year_group'] not in valid_year_groups:
        errors.append("Please select a valid year group")
    
    # Participants validation
    try:
        male_participants = int(data.get('male_participants', 0))
        if male_participants < 0:
            errors.append("Male participants cannot be negative")
        if male_participants > 1000:
            errors.append("Male participants seems too high (max 1000)")
    except (ValueError, TypeError):
        errors.append("Male participants must be a valid number")
    
    try:
        female_participants = int(data.get('female_participants', 0))
        if female_participants < 0:
            errors.append("Female participants cannot be negative")
        if female_participants > 1000:
            errors.append("Female participants seems too high (max 1000)")
    except (ValueError, TypeError):
        errors.append("Female participants must be a valid number")
    
    # Check total participants
    try:
        total = int(data.get('male_participants', 0)) + int(data.get('female_participants', 0))
        if total == 0:
            errors.append("Total participants must be greater than 0")
        if total > 2000:
            errors.append("Total participants seems too high (max 2000)")
    except (ValueError, TypeError):
        pass  # Already handled above
    
    # Session duration validation
    try:
        duration = int(data.get('session_duration', 0))
        if duration <= 0:
            errors.append("Session duration must be greater than 0 minutes")
        if duration > 480:  # 8 hours
            errors.append("Session duration seems too long (max 8 hours)")
    except (ValueError, TypeError):
        errors.append("Session duration must be a valid number")
    
    # Date validation
    if data.get('session_date'):
        try:
            session_date = datetime.strptime(data['session_date'], '%Y-%m-%d')
            today = datetime.now()
            if session_date > today:
                errors.append("Session date cannot be in the future")
            if session_date < datetime(2020, 1, 1):
                errors.append("Session date seems too old")
        except ValueError:
            errors.append("Please provide a valid session date")
    
    # Coordinates validation (optional fields)
    if data.get('latitude'):
        try:
            lat = float(data['latitude'])
            if lat < -90 or lat > 90:
                errors.append("Latitude must be between -90 and 90")
        except (ValueError, TypeError):
            errors.append("Latitude must be a valid number")
    
    if data.get('longitude'):
        try:
            lng = float(data['longitude'])
            if lng < -180 or lng > 180:
                errors.append("Longitude must be between -180 and 180")
        except (ValueError, TypeError):
            errors.append("Longitude must be a valid number")
    
    # Teacher feedback validation (optional)
    if data.get('teacher_feedback') and len(data['teacher_feedback']) > 1000:
        errors.append("Teacher feedback must be less than 1000 characters")
    
    return errors

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

# Static files route for offline sync script
@app.route('/static/js/<filename>')
def static_js(filename):
    return send_from_directory('static/js', filename)

# Photo serving route
@app.route('/uploads/photos/<filename>')
def uploaded_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

# API Routes
@app.route('/api/sessions', methods=['GET'])
def get_sessions():
    conn = sqlite3.connect('nzc_activator.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT s.id, s.school_name, s.session_type, s.location, s.activator, s.year_group, 
               s.male_participants, s.female_participants, s.teacher_feedback, s.session_date, 
               s.session_duration, s.date_created, s.latitude, s.longitude,
               COUNT(sp.id) as photo_count
        FROM sessions s
        LEFT JOIN session_photos sp ON s.id = sp.session_id
        GROUP BY s.id
        ORDER BY s.session_date DESC, s.date_created DESC
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
            'session_duration': row[10],
            'date_created': row[11],
            'latitude': row[12],
            'longitude': row[13],
            'photo_count': row[14],
            'total_participants': row[6] + row[7]
        })
    
    conn.close()
    return jsonify(sessions)

@app.route('/api/sessions', methods=['POST'])
def create_session():
    try:
        data = request.json
        if not data:
            return jsonify({'success': False, 'errors': ['No data provided']}), 400
        
        # Validate data
        validation_errors = validate_session_data(data)
        if validation_errors:
            return jsonify({'success': False, 'errors': validation_errors}), 400
        
        conn = sqlite3.connect('nzc_activator.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO sessions (school_name, session_type, location, activator, year_group, 
                                male_participants, female_participants, teacher_feedback, session_date,
                                session_duration, latitude, longitude)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            data['school_name'].strip(),
            data['session_type'].strip(),
            data['location'].strip(),
            data['activator'].strip(),
            data['year_group'],
            int(data['male_participants']),
            int(data['female_participants']),
            data.get('teacher_feedback', '').strip() if data.get('teacher_feedback') else None,
            data['session_date'],
            int(data['session_duration']),
            float(data['latitude']) if data.get('latitude') else None,
            float(data['longitude']) if data.get('longitude') else None
        ))
        
        session_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Session recorded successfully', 'session_id': session_id})
        
    except Exception as e:
        return jsonify({'success': False, 'errors': [f'Server error: {str(e)}']}), 500

@app.route('/api/sessions/<int:session_id>/photos', methods=['POST'])
def upload_photos(session_id):
    try:
        # Check if session exists
        conn = sqlite3.connect('nzc_activator.db')
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM sessions WHERE id = ?', (session_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'success': False, 'errors': ['Session not found']}), 404
        
        if 'photos' not in request.files:
            return jsonify({'success': False, 'errors': ['No photos provided']}), 400
        
        files = request.files.getlist('photos')
        uploaded_photos = []
        
        for file in files:
            if file.filename == '':
                continue
                
            if not allowed_file(file.filename):
                return jsonify({'success': False, 'errors': [f'File type not allowed for {file.filename}']}), 400
            
            # Generate unique filename
            file_extension = file.filename.rsplit('.', 1)[1].lower()
            unique_filename = f"{uuid.uuid4().hex}.{file_extension}"
            file_path = os.path.join(UPLOAD_FOLDER, unique_filename)
            
            # Save file
            file.save(file_path)
            file_size = os.path.getsize(file_path)
            
            # Check file size
            if file_size > MAX_FILE_SIZE:
                os.remove(file_path)  # Remove the file
                return jsonify({'success': False, 'errors': [f'File {file.filename} is too large (max 5MB)']}), 400
            
            # Save to database
            cursor.execute('''
                INSERT INTO session_photos (session_id, filename, original_filename, file_path, file_size)
                VALUES (?, ?, ?, ?, ?)
            ''', (session_id, unique_filename, file.filename, file_path, file_size))
            
            uploaded_photos.append({
                'filename': unique_filename,
                'original_filename': file.filename,
                'size': file_size
            })
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True, 
            'message': f'{len(uploaded_photos)} photos uploaded successfully',
            'photos': uploaded_photos
        })
        
    except Exception as e:
        return jsonify({'success': False, 'errors': [f'Server error: {str(e)}']}), 500

@app.route('/api/sessions/<int:session_id>/photos', methods=['GET'])
def get_session_photos(session_id):
    try:
        conn = sqlite3.connect('nzc_activator.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, filename, original_filename, file_size, upload_date
            FROM session_photos 
            WHERE session_id = ?
            ORDER BY upload_date DESC
        ''', (session_id,))
        
        photos = []
        for row in cursor.fetchall():
            photos.append({
                'id': row[0],
                'filename': row[1],
                'original_filename': row[2],
                'file_size': row[3],
                'upload_date': row[4],
                'url': f'/uploads/photos/{row[1]}'
            })
        
        conn.close()
        return jsonify({'success': True, 'photos': photos})
        
    except Exception as e:
        return jsonify({'success': False, 'errors': [f'Server error: {str(e)}']}), 500

@app.route('/api/sessions/<int:session_id>/photos/<int:photo_id>', methods=['DELETE'])
def delete_photo(session_id, photo_id):
    try:
        conn = sqlite3.connect('nzc_activator.db')
        cursor = conn.cursor()
        
        # Get photo info
        cursor.execute('SELECT filename, file_path FROM session_photos WHERE id = ? AND session_id = ?', 
                      (photo_id, session_id))
        photo = cursor.fetchone()
        
        if not photo:
            conn.close()
            return jsonify({'success': False, 'errors': ['Photo not found']}), 404
        
        # Delete file from filesystem
        try:
            if os.path.exists(photo[1]):
                os.remove(photo[1])
        except OSError:
            pass  # File might already be deleted
        
        # Delete from database
        cursor.execute('DELETE FROM session_photos WHERE id = ? AND session_id = ?', (photo_id, session_id))
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Photo deleted successfully'})
        
    except Exception as e:
        return jsonify({'success': False, 'errors': [f'Server error: {str(e)}']}), 500

@app.route('/api/sessions/<int:session_id>', methods=['PUT'])
def update_session(session_id):
    try:
        data = request.json
        if not data:
            return jsonify({'success': False, 'errors': ['No data provided']}), 400
        
        # Validate data
        validation_errors = validate_session_data(data)
        if validation_errors:
            return jsonify({'success': False, 'errors': validation_errors}), 400
        
        conn = sqlite3.connect('nzc_activator.db')
        cursor = conn.cursor()
        
        # Check if session exists
        cursor.execute('SELECT id FROM sessions WHERE id = ?', (session_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'success': False, 'errors': ['Session not found']}), 404
        
        cursor.execute('''
            UPDATE sessions 
            SET school_name=?, session_type=?, location=?, activator=?, year_group=?, 
                male_participants=?, female_participants=?, teacher_feedback=?, session_date=?,
                session_duration=?, latitude=?, longitude=?
            WHERE id=?
        ''', (
            data['school_name'].strip(),
            data['session_type'].strip(),
            data['location'].strip(),
            data['activator'].strip(),
            data['year_group'],
            int(data['male_participants']),
            int(data['female_participants']),
            data.get('teacher_feedback', '').strip() if data.get('teacher_feedback') else None,
            data['session_date'],
            int(data['session_duration']),
            float(data['latitude']) if data.get('latitude') else None,
            float(data['longitude']) if data.get('longitude') else None,
            session_id
        ))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Session updated successfully'})
        
    except Exception as e:
        return jsonify({'success': False, 'errors': [f'Server error: {str(e)}']}), 500

@app.route('/api/sessions/<int:session_id>', methods=['DELETE'])
def delete_session(session_id):
    try:
        conn = sqlite3.connect('nzc_activator.db')
        cursor = conn.cursor()
        
        # Get all photos for this session to delete files
        cursor.execute('SELECT file_path FROM session_photos WHERE session_id = ?', (session_id,))
        photos = cursor.fetchall()
        
        # Delete photo files
        for photo in photos:
            try:
                if os.path.exists(photo[0]):
                    os.remove(photo[0])
            except OSError:
                pass  # File might already be deleted
        
        # Delete session (photos will be deleted due to CASCADE)
        cursor.execute('DELETE FROM sessions WHERE id = ?', (session_id,))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Session deleted successfully'})
        
    except Exception as e:
        return jsonify({'success': False, 'errors': [f'Server error: {str(e)}']}), 500

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
    app.run(host='0.0.0.0', port=10000, debug=False)
