/**
 * Authentication JavaScript
 */

document.addEventListener('DOMContentLoaded', function () {
    const adminForm = document.getElementById('adminForm');
    const memberForm = document.getElementById('memberForm');

    if (adminForm) {
        adminForm.addEventListener('submit', function (e) {
            e.preventDefault();
            handleAdminLogin();
        });
    }

    if (memberForm) {
        memberForm.addEventListener('submit', function (e) {
            e.preventDefault();
            handleMemberLogin();
        });
    }
});

function handleAdminLogin() {
    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value;
    const submitBtn = document.querySelector('#adminForm button[type="submit"]');

    // Validate inputs
    if (!username || !password) {
        Utils.showNotification('Please enter username and password', 'error');
        return;
    }

    if (username.length < 3) {
        Utils.showNotification('Username must be at least 3 characters', 'error');
        return;
    }

    if (password.length < 6) {
        Utils.showNotification('Password must be at least 6 characters', 'error');
        return;
    }

    // Show loading state
    Utils.setButtonLoading(submitBtn, true);

    fetch('api/auth.php?action=login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            username: username,
            password: password
        })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                Utils.showNotification('Login successful', 'success');
                setTimeout(() => {
                    window.location.href = 'admin-dashboard.html';
                }, 500);
            } else {
                Utils.showNotification(data.message || 'Login failed', 'error');
            }
        })
        .catch(err => {
            console.error('Login error:', err);
            Utils.showNotification('An error occurred during login. Please try again.', 'error');
        })
        .finally(() => {
            // Remove loading state
            const submitBtn = document.querySelector('#adminForm button[type="submit"]');
            if (submitBtn) Utils.setButtonLoading(submitBtn, false);
        });
}

function handleMemberLogin() {
    const memberCode = document.getElementById('memberCode').value.trim();
    const submitBtn = document.querySelector('#memberForm button[type="submit"]');

    // Validate input
    if (!memberCode) {
        Utils.showNotification('Please enter member code', 'error');
        return;
    }

    if (memberCode.length < 2) {
        Utils.showNotification('Please enter a valid member code', 'error');
        return;
    }

    // Show loading state
    Utils.setButtonLoading(submitBtn, true);

    fetch('api/auth.php?action=login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            member_code: memberCode
        })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                Utils.showNotification('Login successful', 'success');
                setTimeout(() => {
                    if (data.gender === 'men') {
                        window.location.href = 'member-profile-men.html';
                    } else {
                        window.location.href = 'member-profile-women.html';
                    }
                }, 500);
            } else {
                Utils.showNotification(data.message || 'Invalid member code', 'error');
            }
        })
        .catch(err => {
            console.error('Login error:', err);
            Utils.showNotification('An error occurred during login. Please try again.', 'error');
        })
        .finally(() => {
            // Remove loading state
            const submitBtn = document.querySelector('#memberForm button[type="submit"]');
            if (submitBtn) Utils.setButtonLoading(submitBtn, false);
        });
}

function handleLogout() {
    fetch('api/auth.php?action=logout', {
        method: 'POST'
    })
        .then(res => res.json())
        .then(data => {
            localStorage.clear();
            window.location.href = 'index.html';
        })
        .catch(err => {
            console.error('Logout error:', err);
            localStorage.clear();
            window.location.href = 'index.html';
        });
}

