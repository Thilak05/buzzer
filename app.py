from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_socketio import SocketIO, emit, join_room, leave_room
import json
import datetime
import os
import uuid
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.config['SECRET_KEY'] = 'buzzer_competition_secret_key_2025'
socketio = SocketIO(app, cors_allowed_origins="*")

# Global application state
app_state = {
    'buzzer_locked': True,
    'participants': {},  # {session_id: {team_name, join_time, buzzer_pressed, buzzer_time}}
    'buzzer_winner': None,
    'host_password': 'zenista@2025',
    'logs': []
}

# Ensure logs directory exists
if not os.path.exists('logs'):
    os.makedirs('logs')

def log_activity(activity, activity_type='info'):
    """Log activity to both memory and file"""
    timestamp = datetime.datetime.now()
    log_entry = {
        'timestamp': timestamp.isoformat(),
        'activity': activity,
        'type': activity_type
    }
    
    # Add to memory (keep last 100 entries)
    app_state['logs'].append(log_entry)
    if len(app_state['logs']) > 100:
        app_state['logs'] = app_state['logs'][-100:]
    
    # Write to file
    log_file = 'logs/log.txt'
    with open(log_file, 'a', encoding='utf-8') as f:
        f.write(f"[{timestamp.strftime('%Y-%m-%d %H:%M:%S')}] {activity}\n")
    
    # Emit to all connected hosts
    socketio.emit('log_update', log_entry, room='hosts')

def is_team_name_taken(team_name, exclude_session=None):
    """Check if team name is already taken (case-insensitive)"""
    team_name_lower = team_name.lower()
    for session_id, participant in app_state['participants'].items():
        if session_id != exclude_session and participant['team_name'].lower() == team_name_lower:
            return True
    return False

@app.route('/')
def index():
    """Main landing page"""
    return render_template('index.html')

@app.route('/participant')
def participant():
    """Participant interface"""
    return render_template('participant.html')

@app.route('/host')
def host():
    """Host interface"""
    return render_template('host.html')

@app.route('/api/validate_team_name', methods=['POST'])
def validate_team_name():
    """Validate team name availability"""
    data = request.get_json()
    team_name = data.get('team_name', '').strip()
    
    if not team_name:
        return jsonify({'valid': False, 'message': 'Team name cannot be empty'})
    
    if len(team_name) > 50:
        return jsonify({'valid': False, 'message': 'Team name must be 50 characters or less'})
    
    if is_team_name_taken(team_name):
        return jsonify({'valid': False, 'message': 'Team name already exists (case-insensitive)'})
    
    return jsonify({'valid': True, 'message': 'Team name is available'})

@app.route('/api/register_team', methods=['POST'])
def register_team():
    """Register a new team"""
    data = request.get_json()
    team_name = data.get('team_name', '').strip()
    
    if not team_name:
        return jsonify({'success': False, 'message': 'Team name cannot be empty'})
    
    if is_team_name_taken(team_name):
        return jsonify({'success': False, 'message': 'Team name already exists'})
    
    # Generate session ID
    session_id = str(uuid.uuid4())
    session['participant_id'] = session_id
    session['team_name'] = team_name
    
    # Add participant
    app_state['participants'][session_id] = {
        'team_name': team_name,
        'join_time': datetime.datetime.now().isoformat(),
        'buzzer_pressed': False,
        'buzzer_time': None
    }
    
    log_activity(f'Team "{team_name}" joined the competition', 'success')
    
    # Notify all clients
    socketio.emit('participant_joined', {
        'team_name': team_name,
        'participant_count': len(app_state['participants'])
    })
    
    return jsonify({
        'success': True, 
        'message': f'Welcome, {team_name}!',
        'session_id': session_id
    })

@app.route('/api/participant_status')
def participant_status():
    """Get current participant status"""
    participant_id = session.get('participant_id')
    if not participant_id or participant_id not in app_state['participants']:
        return jsonify({'authenticated': False})
    
    participant = app_state['participants'][participant_id]
    return jsonify({
        'authenticated': True,
        'team_name': participant['team_name'],
        'buzzer_locked': app_state['buzzer_locked'],
        'buzzer_winner': app_state['buzzer_winner'],
        'participants': [
            {'team_name': p['team_name'], 'buzzer_pressed': p['buzzer_pressed']} 
            for p in app_state['participants'].values()
        ]
    })

@app.route('/api/press_buzzer', methods=['POST'])
def press_buzzer():
    """Handle buzzer press"""
    participant_id = session.get('participant_id')
    if not participant_id or participant_id not in app_state['participants']:
        return jsonify({'success': False, 'message': 'Not authenticated'})
    
    if app_state['buzzer_locked']:
        return jsonify({'success': False, 'message': 'Buzzer is locked'})
    
    participant = app_state['participants'][participant_id]
    if participant['buzzer_pressed']:
        return jsonify({'success': False, 'message': 'You already pressed the buzzer'})
    
    # Check if someone already won
    if app_state['buzzer_winner']:
        return jsonify({'success': False, 'message': 'Someone already buzzed in'})
    
    # Record buzzer press
    buzz_time = datetime.datetime.now()
    participant['buzzer_pressed'] = True
    participant['buzzer_time'] = buzz_time.isoformat()
    
    # Set as winner
    app_state['buzzer_winner'] = {
        'team_name': participant['team_name'],
        'timestamp': buzz_time.isoformat(),
        'participant_id': participant_id
    }
    
    # Lock buzzer
    app_state['buzzer_locked'] = True
    
    log_activity(f'Team "{participant["team_name"]}" pressed the buzzer first!', 'success')
    
    # Notify all clients
    socketio.emit('buzzer_pressed', app_state['buzzer_winner'])
    
    return jsonify({'success': True, 'message': 'Buzzer pressed! You were first!'})

@app.route('/api/logout_participant', methods=['POST'])
def logout_participant():
    """Logout participant"""
    participant_id = session.get('participant_id')
    if participant_id and participant_id in app_state['participants']:
        team_name = app_state['participants'][participant_id]['team_name']
        del app_state['participants'][participant_id]
        
        log_activity(f'Team "{team_name}" left the competition', 'info')
        
        # Notify all clients
        socketio.emit('participant_left', {
            'team_name': team_name,
            'participant_count': len(app_state['participants'])
        })
    
    session.clear()
    return jsonify({'success': True})

@app.route('/api/host_auth', methods=['POST'])
def host_auth():
    """Host authentication"""
    data = request.get_json()
    password = data.get('password', '')
    
    if password == app_state['host_password']:
        session['host_authenticated'] = True
        log_activity('Host authenticated successfully', 'success')
        return jsonify({'success': True, 'message': 'Authentication successful'})
    else:
        log_activity('Failed host authentication attempt', 'error')
        return jsonify({'success': False, 'message': 'Incorrect password'})

@app.route('/api/change_password', methods=['POST'])
def change_password():
    """Change host password"""
    if not session.get('host_authenticated'):
        return jsonify({'success': False, 'message': 'Not authenticated'})
    
    data = request.get_json()
    current_password = data.get('current_password', '')
    new_password = data.get('new_password', '')
    
    if current_password != app_state['host_password']:
        return jsonify({'success': False, 'message': 'Current password is incorrect'})
    
    if len(new_password) < 6:
        return jsonify({'success': False, 'message': 'New password must be at least 6 characters'})
    
    app_state['host_password'] = new_password
    log_activity('Host password changed successfully', 'success')
    
    return jsonify({'success': True, 'message': 'Password changed successfully'})

@app.route('/api/host_status')
def host_status():
    """Get host status and data"""
    if not session.get('host_authenticated'):
        return jsonify({'authenticated': False})
    
    return jsonify({
        'authenticated': True,
        'buzzer_locked': app_state['buzzer_locked'],
        'buzzer_winner': app_state['buzzer_winner'],
        'participants': [
            {
                'team_name': p['team_name'],
                'join_time': p['join_time'],
                'buzzer_pressed': p['buzzer_pressed'],
                'buzzer_time': p['buzzer_time']
            } for p in app_state['participants'].values()
        ],
        'logs': app_state['logs'][-20:]  # Last 20 logs
    })

@app.route('/api/unlock_buzzer', methods=['POST'])
def unlock_buzzer():
    """Unlock buzzer"""
    if not session.get('host_authenticated'):
        return jsonify({'success': False, 'message': 'Not authenticated'})
    
    app_state['buzzer_locked'] = False
    app_state['buzzer_winner'] = None
    
    # Reset all participants
    for participant in app_state['participants'].values():
        participant['buzzer_pressed'] = False
        participant['buzzer_time'] = None
    
    log_activity('Buzzer unlocked by host', 'success')
    
    # Notify all clients
    socketio.emit('buzzer_unlocked', {})
    
    return jsonify({'success': True, 'message': 'Buzzer unlocked'})

@app.route('/api/lock_buzzer', methods=['POST'])
def lock_buzzer():
    """Lock buzzer"""
    if not session.get('host_authenticated'):
        return jsonify({'success': False, 'message': 'Not authenticated'})
    
    app_state['buzzer_locked'] = True
    log_activity('Buzzer locked by host', 'info')
    
    # Notify all clients
    socketio.emit('buzzer_locked', {})
    
    return jsonify({'success': True, 'message': 'Buzzer locked'})

@app.route('/api/clear_winner', methods=['POST'])
def clear_winner():
    """Clear buzzer winner display"""
    if not session.get('host_authenticated'):
        return jsonify({'success': False, 'message': 'Not authenticated'})
    
    app_state['buzzer_winner'] = None
    log_activity('Last buzzer winner display cleared by host', 'info')
    
    # Notify all clients
    socketio.emit('winner_cleared', {})
    
    return jsonify({'success': True, 'message': 'Winner display cleared'})

@app.route('/api/clear_logs', methods=['POST'])
def clear_logs():
    """Clear all logs"""
    if not session.get('host_authenticated'):
        return jsonify({'success': False, 'message': 'Not authenticated'})
    
    app_state['logs'] = []
    
    # Clear log file
    log_file = 'logs/log.txt'
    if os.path.exists(log_file):
        open(log_file, 'w').close()
    
    log_activity('Log cleared by host', 'info')
    
    return jsonify({'success': True, 'message': 'Logs cleared'})

@app.route('/api/logout_host', methods=['POST'])
def logout_host():
    """Host logout"""
    session.pop('host_authenticated', None)
    log_activity('Host logged out', 'info')
    return jsonify({'success': True})

# SocketIO events
@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    print(f'Client connected: {request.sid}')

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    print(f'Client disconnected: {request.sid}')
    
    # Clean up participant if they disconnect without proper logout
    participant_id = session.get('participant_id')
    if participant_id and participant_id in app_state['participants']:
        team_name = app_state['participants'][participant_id]['team_name']
        del app_state['participants'][participant_id]
        log_activity(f'Team "{team_name}" disconnected', 'info')
        emit('participant_left', {
            'team_name': team_name,
            'participant_count': len(app_state['participants'])
        }, broadcast=True)

@socketio.on('join_host')
def handle_join_host():
    """Join host room for real-time updates"""
    if session.get('host_authenticated'):
        join_room('hosts')
        emit('joined_host_room', {'status': 'success'})

@socketio.on('leave_host')
def handle_leave_host():
    """Leave host room"""
    leave_room('hosts')

if __name__ == '__main__':
    log_activity('Competition Buzzer System started', 'info')
    print("🚀 Competition Buzzer System Starting...")
    print("📱 Participant URL: http://localhost:5000/participant")
    print("👑 Host URL: http://localhost:5000/host")
    print("🌐 Network access: Use your computer's IP address instead of localhost")
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
