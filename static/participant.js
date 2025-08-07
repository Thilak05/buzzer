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
                
                updateBuzzerStatus(data.buzzer_locked, data.my_buzzer_locked, data.buzzer_pressed);
                updateParticipantsList(data.participants);
                
                if (data.ranking_data && data.ranking_data.length > 0) {
                    showBuzzerRankings(data.ranking_data);
                }
            }
        })
        .catch(error => {
            console.error('Status load error:', error);
        });
}

// Update buzzer status
function updateBuzzerStatus(globallyLocked, myBuzzerLocked, buzzerPressed) {
    if (globallyLocked) {
        statusIndicator.innerHTML = '<i class="fas fa-lock"></i>';
        statusIndicator.className = 'status-indicator locked';
        statusText.textContent = 'Buzzer Locked';
        statusDescription.textContent = 'Waiting for host to unlock the buzzer...';
        buzzerBtn.disabled = true;
        buzzerBtn.classList.remove('pressed');
    } else if (myBuzzerLocked || buzzerPressed) {
        statusIndicator.innerHTML = '<i class="fas fa-user-lock"></i>';
        statusIndicator.className = 'status-indicator locked';
        statusText.textContent = 'Your Buzzer Locked';
        statusDescription.textContent = 'You already pressed the buzzer. Waiting for host to unlock...';
        buzzerBtn.disabled = true;
        buzzerBtn.classList.add('pressed');
        buzzerBtn.innerHTML = '<i class="fas fa-check"></i> BUZZED!';
    } else {
        statusIndicator.innerHTML = '<i class="fas fa-unlock"></i>';
        statusIndicator.className = 'status-indicator unlocked';
        statusText.textContent = 'Buzzer Ready';
        statusDescription.textContent = 'Click the buzzer to answer!';
        buzzerBtn.disabled = false;
        buzzerBtn.classList.remove('pressed');
        buzzerBtn.innerHTML = '<i class="fas fa-hand-paper"></i> BUZZ!';
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
    buzzerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buzzing...';
    
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
            // Update UI to locked state
            statusIndicator.innerHTML = '<i class="fas fa-user-lock"></i>';
            statusIndicator.className = 'status-indicator locked';
            statusText.textContent = 'Your Buzzer Locked';
            statusDescription.textContent = 'You already pressed the buzzer. Waiting for host to unlock...';
            buzzerBtn.innerHTML = '<i class="fas fa-check"></i> BUZZED!';
            buzzerBtn.disabled = true;
            // Refresh status to get latest rankings
            loadParticipantStatus();
        } else {
            showNotification(data.message, 'error');
            buzzerPressed = false;
            buzzerBtn.classList.remove('pressed');
            buzzerBtn.disabled = false;
            buzzerBtn.innerHTML = '<i class="fas fa-hand-paper"></i> BUZZ!';
        }
    })
    .catch(error => {
        console.error('Buzzer press error:', error);
        showNotification('Failed to press buzzer. Please try again.', 'error');
        buzzerPressed = false;
        buzzerBtn.classList.remove('pressed');
        buzzerBtn.disabled = false;
        buzzerBtn.innerHTML = '<i class="fas fa-hand-paper"></i> BUZZ!';
    });
}

// Show buzzer rankings
function showBuzzerRankings(rankings) {
    if (!rankings || rankings.length === 0) {
        lastBuzzer.style.display = 'none';
        return;
    }

    lastBuzzer.style.display = 'block';
    
    let rankingsHTML = '<h4 style="margin: 0 0 15px 0; color: #333; text-align: center;">📊 Current Rankings</h4>';
    
    rankings.forEach((participant, index) => {
        const timeStr = new Date(participant.buzzer_time).toLocaleTimeString();
        const medalIcon = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${participant.rank}.`;
        
        rankingsHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; margin: 5px 0; background: ${index < 3 ? '#f8f9fa' : '#fff'}; border-radius: 5px; border-left: 3px solid ${index === 0 ? '#f39c12' : index === 1 ? '#95a5a6' : index === 2 ? '#e67e22' : '#bdc3c7'};">
                <span style="font-weight: bold;">${medalIcon} ${participant.team_name}</span>
                <span style="color: #666; font-size: 0.9em;">${timeStr}</span>
            </div>
        `;
    });
    
    lastBuzzer.innerHTML = rankingsHTML;
}

// Show buzzer winner (legacy - now redirects to rankings)
function showBuzzerWinner(winner) {
    // This function is kept for compatibility but redirects to rankings
    loadParticipantStatus();
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

socket.on('buzzer_pressed', (data) => {
    showNotification(`${data.team_name} pressed the buzzer! (Rank #${data.ranking_position})`, 'info');
    
    // Refresh status to get updated rankings
    if (isRegistered) {
        loadParticipantStatus();
    }
});

socket.on('buzzer_cleared', () => {
    // Reset buzzer state for all participants
    buzzerPressed = false;
    buzzerBtn.disabled = false;
    buzzerBtn.innerHTML = '<i class="fas fa-hand-paper"></i> BUZZ!';
    buzzerBtn.className = 'buzzer-btn';
    
    showNotification('All buzzer presses have been cleared by the host', 'info');
    
    // Refresh status to get updated data
    if (isRegistered) {
        loadParticipantStatus();
    }
});

socket.on('participant_buzzer_unlocked', (data) => {
    if (data.team_name === teamName) {
        // My buzzer was specifically unlocked
        buzzerPressed = false;
        buzzerBtn.disabled = false;
        buzzerBtn.innerHTML = '<i class="fas fa-hand-paper"></i> BUZZ!';
        buzzerBtn.className = 'buzzer-btn';
        
        showNotification('Your buzzer has been unlocked by the host!', 'success');
        
        // Refresh status
        loadParticipantStatus();
    }
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
