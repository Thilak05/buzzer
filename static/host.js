// Initialize Socket.IO connection
const socket = io();

// Global variables
let isAuthenticated = false;

// DOM elements
const authSection = document.getElementById('authSection');
const controlSection = document.getElementById('controlSection');
const hostPasswordInput = document.getElementById('hostPassword');
const passwordFeedback = document.getElementById('passwordFeedback');
const currentPasswordInput = document.getElementById('currentPassword');
const newPasswordInput = document.getElementById('newPassword');
const confirmPasswordInput = document.getElementById('confirmPassword');
const hostBuzzerStatus = document.getElementById('hostBuzzerStatus');
const unlockBtn = document.getElementById('unlockBtn');
const lockBtn = document.getElementById('lockBtn');
const lastWinnerDisplay = document.getElementById('lastWinnerDisplay');
const participantsTable = document.getElementById('participantsTable');
const logDisplay = document.getElementById('logDisplay');
const totalParticipants = document.getElementById('totalParticipants');

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
    window.location.href = '/';
}

// Host authentication
function authenticateHost() {
    const password = hostPasswordInput.value;
    
    if (!password) {
        showNotification('Please enter a password', 'error');
        return;
    }
    
    const btn = document.querySelector('.primary-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="loading"></span>Authenticating...';
    btn.disabled = true;
    
    fetch('/api/host_auth', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            isAuthenticated = true;
            authSection.style.display = 'none';
            controlSection.style.display = 'block';
            
            showNotification(data.message, 'success');
            
            // Join host room for real-time updates
            socket.emit('join_host');
            
            // Load host data
            loadHostStatus();
        } else {
            passwordFeedback.textContent = data.message;
            passwordFeedback.className = 'input-feedback error';
            showNotification(data.message, 'error');
        }
    })
    .catch(error => {
        console.error('Authentication error:', error);
        showNotification('Authentication failed. Please try again.', 'error');
    })
    .finally(() => {
        btn.innerHTML = originalText;
        btn.disabled = false;
        hostPasswordInput.value = '';
    });
}

// Change password
function changePassword() {
    const currentPassword = currentPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    
    if (!currentPassword || !newPassword || !confirmPassword) {
        showNotification('Please fill in all password fields', 'error');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showNotification('New passwords do not match', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showNotification('New password must be at least 6 characters long', 'error');
        return;
    }
    
    fetch('/api/change_password', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            current_password: currentPassword,
            new_password: newPassword
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            currentPasswordInput.value = '';
            newPasswordInput.value = '';
            confirmPasswordInput.value = '';
            showNotification(data.message, 'success');
        } else {
            showNotification(data.message, 'error');
        }
    })
    .catch(error => {
        console.error('Password change error:', error);
        showNotification('Password change failed. Please try again.', 'error');
    });
}

// Load host status
function loadHostStatus() {
    fetch('/api/host_status')
        .then(response => response.json())
        .then(data => {
            if (data.authenticated) {
                updateHostUI(data);
                updateParticipantsTable(data.participants);
                updateLogDisplay(data.logs);
            } else {
                isAuthenticated = false;
                authSection.style.display = 'block';
                controlSection.style.display = 'none';
            }
        })
        .catch(error => {
            console.error('Status load error:', error);
        });
}

// Update host UI
function updateHostUI(data) {
    totalParticipants.textContent = data.participants.length;
    
    if (data.buzzer_locked) {
        hostBuzzerStatus.innerHTML = '<span class="status-indicator locked"><i class="fas fa-lock"></i> LOCKED</span>';
        unlockBtn.disabled = false;
        lockBtn.disabled = true;
    } else {
        hostBuzzerStatus.innerHTML = '<span class="status-indicator unlocked"><i class="fas fa-unlock"></i> UNLOCKED</span>';
        unlockBtn.disabled = true;
        lockBtn.disabled = false;
    }
    
    // Update last winner display
    if (data.buzzer_winner) {
        const timeStr = new Date(data.buzzer_winner.timestamp).toLocaleTimeString();
        lastWinnerDisplay.innerHTML = `
            <div style="text-align: center;">
                <i class="fas fa-trophy" style="color: #f39c12; font-size: 2rem; margin-bottom: 10px;"></i>
                <h4 style="margin: 0; color: #333;">${data.buzzer_winner.team_name}</h4>
                <p style="margin: 5px 0 0 0; color: #666;">Buzzed at ${timeStr}</p>
            </div>
        `;
    } else {
        lastWinnerDisplay.innerHTML = '<p>No buzzer pressed yet</p>';
    }
}

// Unlock buzzer
function unlockBuzzer() {
    fetch('/api/unlock_buzzer', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification(data.message, 'success');
            loadHostStatus();
        } else {
            showNotification(data.message, 'error');
        }
    })
    .catch(error => {
        console.error('Unlock error:', error);
        showNotification('Failed to unlock buzzer', 'error');
    });
}

// Lock buzzer
function lockBuzzer() {
    fetch('/api/lock_buzzer', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification(data.message, 'info');
            loadHostStatus();
        } else {
            showNotification(data.message, 'error');
        }
    })
    .catch(error => {
        console.error('Lock error:', error);
        showNotification('Failed to lock buzzer', 'error');
    });
}

// Clear last buzzer
function clearLastBuzzer() {
    fetch('/api/clear_winner', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification(data.message, 'info');
            loadHostStatus();
        } else {
            showNotification(data.message, 'error');
        }
    })
    .catch(error => {
        console.error('Clear winner error:', error);
        showNotification('Failed to clear winner display', 'error');
    });
}

// Update participants table
function updateParticipantsTable(participants) {
    if (!participants || participants.length === 0) {
        participantsTable.innerHTML = `
            <div class="no-participants">
                <i class="fas fa-user-slash"></i>
                <p>No participants connected</p>
            </div>
        `;
        return;
    }
    
    participantsTable.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Team Name</th>
                    <th>Join Time</th>
                    <th>Status</th>
                    <th>Buzzer Time</th>
                </tr>
            </thead>
            <tbody>
                ${participants.map(participant => {
                    const joinTime = new Date(participant.join_time).toLocaleTimeString();
                    const buzzerTime = participant.buzzer_time ? new Date(participant.buzzer_time).toLocaleTimeString() : '-';
                    const status = participant.buzzer_pressed ? 
                        '<span style="color: #f39c12; font-weight: bold;"><i class="fas fa-bell"></i> Buzzed</span>' : 
                        '<span style="color: #4CAF50;"><i class="fas fa-check-circle"></i> Ready</span>';
                    
                    return `
                        <tr>
                            <td style="font-weight: 500;">${participant.team_name}</td>
                            <td style="color: #666;">${joinTime}</td>
                            <td>${status}</td>
                            <td style="color: #666;">${buzzerTime}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

// Update log display
function updateLogDisplay(logs) {
    if (!logs || logs.length === 0) {
        logDisplay.innerHTML = '<div class="log-entry">No activity logged yet.</div>';
        return;
    }
    
    // Show logs in reverse order (newest first)
    const reversedLogs = [...logs].reverse();
    
    logDisplay.innerHTML = reversedLogs.map(log => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        return `<div class="log-entry ${log.type}">[${time}] ${log.activity}</div>`;
    }).join('');
    
    // Auto-scroll to top (newest)
    logDisplay.scrollTop = 0;
}

// Refresh log
function refreshLog() {
    if (isAuthenticated) {
        loadHostStatus();
        showNotification('Log refreshed', 'info');
    }
}

// Clear log
function clearLog() {
    if (!confirm('Are you sure you want to clear all logs? This action cannot be undone.')) {
        return;
    }
    
    fetch('/api/clear_logs', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification(data.message, 'success');
            loadHostStatus();
        } else {
            showNotification(data.message, 'error');
        }
    })
    .catch(error => {
        console.error('Clear log error:', error);
        showNotification('Failed to clear logs', 'error');
    });
}

// Host logout
function logoutHost() {
    fetch('/api/logout_host', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            isAuthenticated = false;
            authSection.style.display = 'block';
            controlSection.style.display = 'none';
            
            // Leave host room
            socket.emit('leave_host');
            
            // Clear password fields
            hostPasswordInput.value = '';
            passwordFeedback.textContent = '';
            passwordFeedback.className = 'input-feedback';
            
            showNotification('Logged out successfully', 'info');
        }
    })
    .catch(error => {
        console.error('Logout error:', error);
        showNotification('Logout failed', 'error');
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
    
    if (isAuthenticated) {
        socket.emit('join_host');
    }
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    connectionStatus.className = 'connection-status disconnected';
    connectionStatus.textContent = '🔴 Disconnected - Reconnecting...';
});

socket.on('joined_host_room', (data) => {
    console.log('Joined host room');
});

socket.on('participant_joined', (data) => {
    if (isAuthenticated) {
        showNotification(`${data.team_name} joined (${data.participant_count} total)`, 'info');
        loadHostStatus();
    }
});

socket.on('participant_left', (data) => {
    if (isAuthenticated) {
        showNotification(`${data.team_name} left (${data.participant_count} total)`, 'info');
        loadHostStatus();
    }
});

socket.on('buzzer_pressed', (winner) => {
    if (isAuthenticated) {
        showNotification(`🏆 ${winner.team_name} pressed the buzzer!`, 'success');
        loadHostStatus();
    }
});

socket.on('log_update', (logEntry) => {
    if (isAuthenticated) {
        // Add new log entry to display
        const logDiv = document.createElement('div');
        logDiv.className = `log-entry ${logEntry.type}`;
        const time = new Date(logEntry.timestamp).toLocaleTimeString();
        logDiv.textContent = `[${time}] ${logEntry.activity}`;
        
        logDisplay.insertBefore(logDiv, logDisplay.firstChild);
        
        // Keep only last 20 entries visible
        const entries = logDisplay.querySelectorAll('.log-entry');
        if (entries.length > 20) {
            entries[entries.length - 1].remove();
        }
    }
});

// Handle Enter key in password field
hostPasswordInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        authenticateHost();
    }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Check if already authenticated
    loadHostStatus();
    
    // Periodic status updates
    setInterval(() => {
        if (isAuthenticated) {
            loadHostStatus();
        }
    }, 5000);
});

// Make functions globally available
window.authenticateHost = authenticateHost;
window.changePassword = changePassword;
window.unlockBuzzer = unlockBuzzer;
window.lockBuzzer = lockBuzzer;
window.clearLastBuzzer = clearLastBuzzer;
window.refreshLog = refreshLog;
window.clearLog = clearLog;
window.logoutHost = logoutHost;
window.goBack = goBack;
