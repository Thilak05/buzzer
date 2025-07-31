// Initialize Socket.IO connection
const socket = io();

// Global variables
let isRegistered = false;
let teamName = '';
let buzzerPressed = false;

// DOM elements
const registrationSection = document.getElementById('registrationSection');
const buzzerSection = document.getElementById('buzzerSection');
const teamNameInput = document.getElementById('teamName');
const teamNameFeedback = document.getElementById('teamNameFeedback');
const registeredTeamNameSpan = document.getElementById('registeredTeamName');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const statusDescription = document.getElementById('statusDescription');
const buzzerBtn = document.getElementById('buzzerBtn');
const lastBuzzer = document.getElementById('lastBuzzer');
const winnerInfo = document.getElementById('winnerInfo');
const participantsList = document.getElementById('participantsList');
const participantCount = document.getElementById('participantCount');

// Connection status
const connectionStatus = document.createElement('div');
connectionStatus.className = 'connection-status';
document.body.appendChild(connectionStatus);

// Utility functions
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'times-circle' : 'info-circle'}"></i>
        ${message}
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function goBack() {
    if (isRegistered) {
        logout();
    } else {
        window.location.href = '/';
    }
}

// Team name validation
let validationTimeout;
teamNameInput.addEventListener('input', function() {
    const currentTeamName = this.value.trim();
    
    clearTimeout(validationTimeout);
    
    if (!currentTeamName) {
        teamNameFeedback.textContent = '';
        teamNameFeedback.className = 'input-feedback';
        return;
    }
    
    validationTimeout = setTimeout(() => {
        fetch('/api/validate_team_name', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ team_name: currentTeamName })
        })
        .then(response => response.json())
        .then(data => {
            teamNameFeedback.textContent = data.message;
            teamNameFeedback.className = `input-feedback ${data.valid ? 'success' : 'error'}`;
        })
        .catch(error => {
            console.error('Validation error:', error);
            teamNameFeedback.textContent = 'Error validating team name';
            teamNameFeedback.className = 'input-feedback error';
        });
    }, 500);
});

// Team registration
function registerTeam() {
    const currentTeamName = teamNameInput.value.trim();
    
    if (!currentTeamName) {
        showNotification('Please enter a team name', 'error');
        return;
    }
    
    const btn = document.querySelector('.primary-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="loading"></span>Joining...';
    btn.disabled = true;
    
    fetch('/api/register_team', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ team_name: currentTeamName })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            teamName = currentTeamName;
            isRegistered = true;
            
            registrationSection.style.display = 'none';
            buzzerSection.style.display = 'block';
            registeredTeamNameSpan.textContent = teamName;
            
            showNotification(data.message, 'success');
            loadParticipantStatus();
        } else {
            showNotification(data.message, 'error');
        }
    })
    .catch(error => {
        console.error('Registration error:', error);
        showNotification('Registration failed. Please try again.', 'error');
    })
    .finally(() => {
        btn.innerHTML = originalText;
        btn.disabled = false;
    });
}

// Load participant status
function loadParticipantStatus() {
    fetch('/api/participant_status')
        .then(response => response.json())
        .then(data => {
            if (data.authenticated) {
                isRegistered = true;
                teamName = data.team_name;
                
                registrationSection.style.display = 'none';
                buzzerSection.style.display = 'block';
                registeredTeamNameSpan.textContent = teamName;
                
                updateBuzzerStatus(data.buzzer_locked);
                updateParticipantsList(data.participants);
                
                if (data.buzzer_winner) {
                    showBuzzerWinner(data.buzzer_winner);
                }
            }
        })
        .catch(error => {
            console.error('Status load error:', error);
        });
}

// Update buzzer status
function updateBuzzerStatus(locked) {
    if (locked) {
        statusIndicator.innerHTML = '<i class="fas fa-lock"></i>';
        statusIndicator.className = 'status-indicator locked';
        statusText.textContent = 'Buzzer Locked';
        statusDescription.textContent = 'Waiting for host to unlock the buzzer...';
        buzzerBtn.disabled = true;
        buzzerBtn.classList.remove('pressed');
    } else {
        statusIndicator.innerHTML = '<i class="fas fa-unlock"></i>';
        statusIndicator.className = 'status-indicator unlocked';
        statusText.textContent = 'Buzzer Ready';
        statusDescription.textContent = 'Click the buzzer to answer!';
        buzzerBtn.disabled = false;
        buzzerPressed = false;
    }
}

// Press buzzer
function pressBuzzer() {
    if (buzzerPressed || buzzerBtn.disabled) {
        return;
    }
    
    buzzerPressed = true;
    buzzerBtn.classList.add('pressed');
    buzzerBtn.disabled = true;
    
    fetch('/api/press_buzzer', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification(data.message, 'success');
        } else {
            showNotification(data.message, 'error');
            buzzerPressed = false;
            buzzerBtn.classList.remove('pressed');
            buzzerBtn.disabled = false;
        }
    })
    .catch(error => {
        console.error('Buzzer press error:', error);
        showNotification('Failed to press buzzer. Please try again.', 'error');
        buzzerPressed = false;
        buzzerBtn.classList.remove('pressed');
        buzzerBtn.disabled = false;
    });
}

// Show buzzer winner
function showBuzzerWinner(winner) {
    if (!winner) {
        lastBuzzer.style.display = 'none';
        return;
    }
    
    const timeStr = new Date(winner.timestamp).toLocaleTimeString();
    winnerInfo.innerHTML = `
        <i class="fas fa-trophy"></i>
        <strong>${winner.team_name}</strong>
        <small>at ${timeStr}</small>
    `;
    lastBuzzer.style.display = 'block';
}

// Update participants list
function updateParticipantsList(participants) {
    if (!participants || participants.length === 0) {
        participantsList.innerHTML = '<div class="no-participants"><i class="fas fa-user-slash"></i><p>No other participants</p></div>';
        participantCount.textContent = '0';
        return;
    }
    
    participantCount.textContent = participants.length;
    
    participantsList.innerHTML = participants
        .map(participant => `
            <div class="participant-card ${participant.buzzer_pressed ? 'buzzed' : ''}">
                <i class="fas fa-flag"></i>
                <div>${participant.team_name}</div>
                ${participant.buzzer_pressed ? '<i class="fas fa-bell" style="color: #fff;"></i>' : ''}
            </div>
        `).join('');
}

// Logout
function logout() {
    if (!isRegistered) {
        window.location.href = '/';
        return;
    }
    
    fetch('/api/logout_participant', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification('You have left the competition', 'info');
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        }
    })
    .catch(error => {
        console.error('Logout error:', error);
        window.location.href = '/';
    });
}

// Socket.IO event handlers
socket.on('connect', () => {
    console.log('Connected to server');
    connectionStatus.className = 'connection-status connected';
    connectionStatus.textContent = '🟢 Connected';
    setTimeout(() => {
        connectionStatus.style.display = 'none';
    }, 2000);
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    connectionStatus.className = 'connection-status disconnected';
    connectionStatus.textContent = '🔴 Disconnected - Reconnecting...';
});

socket.on('buzzer_unlocked', () => {
    updateBuzzerStatus(false);
    showNotification('Buzzer has been unlocked! Get ready!', 'success');
});

socket.on('buzzer_locked', () => {
    updateBuzzerStatus(true);
    buzzerPressed = false;
    buzzerBtn.classList.remove('pressed');
    showNotification('Buzzer has been locked by host', 'info');
});

socket.on('buzzer_pressed', (winner) => {
    updateBuzzerStatus(true);
    showBuzzerWinner(winner);
    
    if (winner.team_name !== teamName) {
        showNotification(`${winner.team_name} pressed the buzzer first!`, 'info');
        buzzerBtn.disabled = true;
    }
});

socket.on('winner_cleared', () => {
    showBuzzerWinner(null);
});

socket.on('participant_joined', (data) => {
    showNotification(`${data.team_name} joined the competition`, 'info');
    // Refresh participant list
    if (isRegistered) {
        loadParticipantStatus();
    }
});

socket.on('participant_left', (data) => {
    showNotification(`${data.team_name} left the competition`, 'info');
    // Refresh participant list
    if (isRegistered) {
        loadParticipantStatus();
    }
});

// Handle Enter key in team name input
teamNameInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        registerTeam();
    }
});

// Handle page unload
window.addEventListener('beforeunload', function() {
    if (isRegistered) {
        navigator.sendBeacon('/api/logout_participant', '{}');
    }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadParticipantStatus();
    
    // Periodic status updates
    setInterval(() => {
        if (isRegistered) {
            loadParticipantStatus();
        }
    }, 5000);
});

// Make functions globally available
window.registerTeam = registerTeam;
window.pressBuzzer = pressBuzzer;
window.logout = logout;
window.goBack = goBack;
