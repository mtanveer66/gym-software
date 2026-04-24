/**
 * Admin Dashboard JavaScript
 */

let currentSection = 'dashboard';
let currentGender = 'men';
let activeRequests = {}; // Track active fetch requests to cancel them if needed
let isLoadingDashboard = false; // Prevent multiple simultaneous dashboard loads
let memberStatusFilter = null; // 'active', 'inactive', or null for all
let paymentsDefaultersFilter = false; // Show defaulters or regular payments

document.addEventListener('DOMContentLoaded', function () {
    checkAuth();
    setupNavigation();
    setupMobileMenu();
    loadDashboard();
    startAutoSync(); // Start auto-sync timer

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
});

function setupMobileMenu() {
    const mobileToggle = document.getElementById('mobileMenuToggle');
    const sidebar = document.getElementById('sidebar');
    const contentBody = document.getElementById('contentBody');

    if (mobileToggle && sidebar) {
        mobileToggle.addEventListener('click', function () {
            sidebar.classList.toggle('open');
        });

        // Close sidebar when clicking outside on mobile
        if (contentBody) {
            contentBody.addEventListener('click', function (e) {
                if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
                    if (!sidebar.contains(e.target) && !mobileToggle.contains(e.target)) {
                        sidebar.classList.remove('open');
                    }
                }
            });
        }

        // Close sidebar when clicking a nav item on mobile
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', function () {
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('open');
                }
            });
        });
    }
}

function checkAuth() {
    fetch('api/auth.php?action=check')
        .then(res => res.json())
        .then(data => {
            if (!data.authenticated || data.role !== 'admin') {
                window.location.href = 'index.html';
            } else {
                const userName = document.getElementById('userName');
                if (userName) {
                    userName.textContent = data.username || 'Admin';
                }
            }
        })
        .catch(err => {
            console.error('Auth check error:', err);
            window.location.href = 'index.html';
        });
}

function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.id !== 'logoutBtn') {
            item.addEventListener('click', function (e) {
                e.preventDefault();
                const section = this.dataset.section;
                switchSection(section);
            });
        }
    });
}

function switchSection(section) {
    // Don't reload if already on this section
    if (currentSection === section && document.getElementById('contentBody').innerHTML !== '<div class="loading">Loading...</div>') {
        return;
    }

    currentSection = section;

    // Cancel all active requests when switching sections
    Object.keys(activeRequests).forEach(key => {
        if (activeRequests[key]) {
            activeRequests[key].abort();
            delete activeRequests[key];
        }
    });

    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    const navItem = document.querySelector(`[data-section="${section}"]`);
    if (navItem) {
        navItem.classList.add('active');
    }

    // Update page title
    const titles = {
        'dashboard': 'Dashboard',
        'members': 'Members',
        'attendance': 'Attendance',
        'payments': 'Payments',
        'due-fees': 'Due Fees Management',
        'expenses': 'Expenses Management',
        'reports': 'Reports',
        'import': 'Import Members',
        'sync': 'Sync Data',
        'reminders': 'WhatsApp Reminders'
    };
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) {
        pageTitle.textContent = titles[section] || 'Dashboard';
    }

    // Load section content
    loadSection(section);
}

function loadSection(section) {
    // Cancel any pending requests for this section
    if (activeRequests[section]) {
        activeRequests[section].abort();
        delete activeRequests[section];
    }

    const contentBody = document.getElementById('contentBody');
    if (!contentBody) return;

    contentBody.innerHTML = '<div class="loading">Loading...</div>';

    switch (section) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'members':
            loadMembers();
            break;
        case 'attendance':
            loadAttendance();
            break;
        case 'payments':
            loadPayments();
            break;
        case 'due-fees':
            loadDueFees();
            break;
        case 'expenses':
            loadExpenses();
            break;
        case 'reports':
            loadReports();
            break;
        case 'import':
            loadImport();
            break;
        case 'sync':
            loadSync();
            break;
        case 'reminders':
            loadReminders();
            break;
    }
}

function loadReminders() {
    const contentBody = document.getElementById('contentBody');
    if (!contentBody) return;

    contentBody.innerHTML = `
        <div class="section-card">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;">
                <div>
                    <h2>WhatsApp Reminders</h2>
                    <p>Queue fee due and overdue reminders for active members.</p>
                </div>
                <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                    <button class="btn btn-primary" onclick="queueFeeReminders('fee_due')">Queue Due Reminders</button>
                    <button class="btn btn-warning" onclick="queueFeeReminders('fee_overdue')">Queue Overdue Reminders</button>
                </div>
            </div>
            <div id="reminderStats" style="margin-top:1rem;">Loading reminder stats...</div>
            <div id="reminderQueue" style="margin-top:1rem;">Loading pending reminder queue...</div>
        </div>
    `;

    Promise.all([
        fetch('api/reminders.php?action=stats').then(r => r.json()),
        fetch('api/reminders.php?action=pending&limit=20').then(r => r.json())
    ]).then(([statsRes, queueRes]) => {
        const statsEl = document.getElementById('reminderStats');
        const queueEl = document.getElementById('reminderQueue');

        if (statsEl) {
            const stats = statsRes.data || {};
            statsEl.innerHTML = `
                <div class="stats-grid">
                    <div class="stat-card"><h3>Pending</h3><p>${stats.pending_count || 0}</p></div>
                    <div class="stat-card"><h3>Sent</h3><p>${stats.sent_count || 0}</p></div>
                    <div class="stat-card"><h3>Failed</h3><p>${stats.failed_count || 0}</p></div>
                </div>
            `;
        }

        if (queueEl) {
            const rows = (queueRes.data || []).map(item => `
                <tr>
                    <td>${item.id}</td>
                    <td>${item.recipient}</td>
                    <td>${item.message_purpose}</td>
                    <td>${item.status}</td>
                    <td>${item.scheduled_for}</td>
                </tr>
            `).join('');

            queueEl.innerHTML = `
                <table class="data-table">
                    <thead>
                        <tr><th>ID</th><th>Recipient</th><th>Purpose</th><th>Status</th><th>Scheduled</th></tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="5">No pending reminders</td></tr>'}</tbody>
                </table>
            `;
        }
    }).catch(err => {
        console.error('Reminder load error:', err);
    });
}

function queueFeeReminders(purpose) {
    fetch(`api/reminders.php?action=queue-fee-reminders&gender=${currentGender}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose, gym_name: 'Your Gym' })
    })
    .then(r => r.json())
    .then(data => {
        alert(data.message || 'Queue action completed');
        loadReminders();
    })
    .catch(err => {
        console.error('Queue reminder error:', err);
        alert('Failed to queue reminders');
    });
}

function loadDashboard() {
    // Prevent multiple simultaneous dashboard loads
    if (isLoadingDashboard && activeRequests['dashboard']) {
        return;
    }

    // Cancel any existing dashboard request
    if (activeRequests['dashboard']) {
        activeRequests['dashboard'].abort();
    }

    isLoadingDashboard = true;

    // Create new abort controller for this request
    const abortController = new AbortController();
    activeRequests['dashboard'] = abortController;

    // Set timeout to prevent hanging
    const timeoutId = setTimeout(() => {
        if (!abortController.signal.aborted) {
            abortController.abort();
            isLoadingDashboard = false;
            // Force clear loading state
            const contentBody = document.getElementById('contentBody');
            if (contentBody && contentBody.innerHTML.includes('Loading')) {
                contentBody.innerHTML = '<div class="error">Dashboard loading timeout. Please refresh the page.</div>';
            }
        }
    }, 15000); // 15 second timeout (reduced from 30)


    // Add cache-busting parameter to prevent stale data
    const cacheBuster = new Date().getTime();
    fetch(`api/dashboard.php?_=${cacheBuster}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
        },
        credentials: 'same-origin',
        signal: abortController.signal,
        cache: 'no-store'
    })
        .then(async res => {
            clearTimeout(timeoutId);
            const text = await res.text();
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${text}`);
            }
            try {
                return JSON.parse(text);
            } catch (e) {
                throw new Error('Invalid JSON response: ' + text.substring(0, 100));
            }
        })
        .then(data => {
            // Check if request was cancelled
            if (abortController.signal.aborted) {
                return;
            }

            delete activeRequests['dashboard'];
            isLoadingDashboard = false;

            const contentBody = document.getElementById('contentBody');
            if (!contentBody) return;

            // Only update if we're still on the dashboard section
            if (currentSection !== 'dashboard') {
                return;
            }

            if (data && data.success) {
                renderDashboard(data.data);
            } else {
                contentBody.innerHTML =
                    '<div class="error">Failed to load dashboard data: ' + (data?.message || 'Unknown error') + '</div>';
            }
        })
        .catch(err => {
            clearTimeout(timeoutId);
            delete activeRequests['dashboard'];
            isLoadingDashboard = false;

            // Don't show error if request was aborted (user navigated away)
            if (err.name === 'AbortError') {
                return;
            }

            console.error('Dashboard error:', err);
            const contentBody = document.getElementById('contentBody');
            if (contentBody && currentSection === 'dashboard') {
                contentBody.innerHTML =
                    '<div class="error">Error loading dashboard: ' + err.message + '</div>';
            }
        });
}

function renderDashboard(data) {
    // Ensure all data structures exist with defaults
    data = data || {};
    const financial = data.financial || {};
    const currentMonth = financial.current_month || {};
    const allTime = financial.all_time || {};
    const men = data.men || { stats: { total: 0, active: 0 }, recent: [] };
    const women = data.women || { stats: { total: 0, active: 0 }, recent: [] };
    const total = data.total || { members: 0, active: 0 };

    const html = `
        <div class="dashboard-stats">
            <div class="stat-card">
                <h3>Total Members</h3>
                <p class="stat-value">${total.members || 0}</p>
            </div>
            <div class="stat-card">
                <h3>Active Members</h3>
                <p class="stat-value">${total.active || 0}</p>
            </div>
            <div class="stat-card">
                <h3>Men Members</h3>
                <p class="stat-value">${men.stats?.total || 0}</p>
                <small>Active: ${men.stats?.active || 0} | Inactive: ${men.stats?.inactive || 0}</small>
            </div>
            <div class="stat-card">
                <h3>Women Members</h3>
                <p class="stat-value">${women.stats?.total || 0}</p>
                <small>Active: ${women.stats?.active || 0} | Inactive: ${women.stats?.inactive || 0}</small>
            </div>
        </div>
        <div class="dashboard-stats" style="margin-top: 1.5rem;">
            <div class="stat-card" style="background: linear-gradient(135deg, #667eea 0%,rgba(172, 81, 149, 0.32) 100%); color: white;">
                <h3 style="color: rgba(255,255,255,0.9);">💰 This Month Income (Intake)</h3>
                <p class="stat-value" style="color: white; font-size: 2rem;">${Utils.formatCurrency(currentMonth.revenue || 0)}</p>
                <small style="color: rgba(255,255,255,0.8);">Total payments received</small>
            </div>
            <div class="stat-card" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white;">
                <h3 style="color: rgba(255,255,255,0.9);">💸 This Month Expenses (Outgoing)</h3>
                <p class="stat-value" style="color: white; font-size: 2rem;">${Utils.formatCurrency(currentMonth.expenses || 0)}</p>
                <small style="color: rgba(255,255,255,0.8);">Total expenses paid</small>
            </div>
            <div class="stat-card" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white;">
                <h3 style="color: rgba(255,255,255,0.9);">📊 This Month Net Profit</h3>
                <p class="stat-value" style="color: white; font-size: 2rem;">${Utils.formatCurrency(currentMonth.profit || 0)}</p>
                <small style="color: rgba(255,255,255,0.8);">${(currentMonth.profit || 0) >= 0 ? '✅ Profit' : '❌ Loss'}</small>
            </div>
            <div class="stat-card" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); color: white;">
                <h3 style="color: rgba(255,255,255,0.9);">📈 All Time Summary</h3>
                <p class="stat-value" style="color: white; font-size: 1.5rem;">${Utils.formatCurrency(allTime.net_profit || 0)}</p>
                <small style="color: rgba(255,255,255,0.8);">
                    <div style="margin-top: 0.5rem;">Income: ${Utils.formatCurrency(allTime.revenue || 0)}</div>
                    <div>Expenses: ${Utils.formatCurrency(allTime.expenses || 0)}</div>
                </small>
            </div>
        </div>
        <div class="dashboard-stats" style="margin-top: 1.5rem;">
            <div class="stat-card" style="background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); color: white; cursor: pointer;" onclick="forceOpenGate('checkin')">
                <h3 style="color: rgba(255,255,255,0.9);">🚪 Force Open Check-In Gate</h3>
                <p class="stat-value" style="color: white; font-size: 1.5rem;">Click to Open</p>
                <small style="color: rgba(255,255,255,0.8);">Manually open check-in gate</small>
            </div>
            <div class="stat-card" style="background: linear-gradient(135deg, #30cfd0 0%, #330867 100%); color: white; cursor: pointer;" onclick="forceOpenGate('checkout')">
                <h3 style="color: rgba(255,255,255,0.9);">🚪 Force Open Check-Out Gate</h3>
                <p class="stat-value" style="color: white; font-size: 1.5rem;">Click to Open</p>
                <small style="color: rgba(255,255,255,0.8);">Manually open check-out gate</small>
            </div>
        </div>
        <div class="dashboard-recent">
            <h2>Recent Members - Men</h2>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Code</th>
                        <th>Name</th>
                        <th>Phone</th>
                        <th>Join Date</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${(men.recent || []).length > 0 ? men.recent.map((m, idx) => `
                        <tr>
                            <td>${idx + 1}</td>
                            <td>${m.member_code}</td>
                            <td>${m.name}</td>
                            <td>${m.phone}</td>
                            <td>${Utils.formatDate(m.join_date)}</td>
                            <td><span class="status-badge status-${m.status}">${m.status}</span></td>
                        </tr>
                    `).join('') : '<tr><td colspan="5" style="text-align: center; padding: 2rem;">No members yet</td></tr>'}
                </tbody>
            </table>
            <h2>Recent Members - Women</h2>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Code</th>
                        <th>Name</th>
                        <th>Phone</th>
                        <th>Join Date</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${(women.recent || []).length > 0 ? women.recent.map((m, idx) => `
                        <tr>
                            <td>${idx + 1}</td>
                            <td>${m.member_code}</td>
                            <td>${m.name}</td>
                            <td>${m.phone}</td>
                            <td>${Utils.formatDate(m.join_date)}</td>
                            <td><span class="status-badge status-${m.status}">${m.status}</span></td>
                        </tr>
                    `).join('') : '<tr><td colspan="5" style="text-align: center; padding: 2rem;">No members yet</td></tr>'}
                </tbody>
            </table>
        </div>
    `;
    document.getElementById('contentBody').innerHTML = html;
}

function forceOpenGate(gateType) {
    if (!confirm(`Are you sure you want to force open the ${gateType === 'checkin' ? 'Check-In' : 'Check-Out'} gate?`)) {
        return;
    }

    fetch(`api/gate.php?type=force_open&gate=${gateType}`)
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                Utils.showNotification(`Force open command sent for ${gateType === 'checkin' ? 'Check-In' : 'Check-Out'} gate`, 'success');
            } else {
                Utils.showNotification(data.message || 'Failed to send force open command', 'error');
            }
        })
        .catch(err => {
            console.error('Force open error:', err);
            Utils.showNotification('Error sending force open command', 'error');
        });
}

function loadMembers() {
    const html = `
        <div class="members-section">
            <div class="section-header">
                <div class="gender-tabs">
                    <button class="gender-tab ${currentGender === 'men' ? 'active' : ''}" data-gender="men">Men Members</button>
                    <button class="gender-tab ${currentGender === 'women' ? 'active' : ''}" data-gender="women">Women Members</button>
                </div>
                <div class="section-actions">
                    <input type="text" id="memberSearch" placeholder="Search members..." class="search-input">
                    <button class="btn ${memberStatusFilter === 'active' ? 'btn-primary' : 'btn-secondary'}" id="activeOnlyBtn">Active</button>
                    <button class="btn ${memberStatusFilter === 'inactive' ? 'btn-primary' : 'btn-secondary'}" id="inactiveOnlyBtn">Inactive</button>
                    <button class="btn ${memberStatusFilter === null ? 'btn-primary' : 'btn-secondary'}" id="allMembersBtn">All</button>
                    <button class="btn btn-primary" id="addMemberBtn">Add Member</button>
                </div>
            </div>
            <div id="membersTableContainer"></div>
        </div>
    `;
    document.getElementById('contentBody').innerHTML = html;

    // Setup gender tabs
    document.querySelectorAll('.gender-tab').forEach(tab => {
        tab.addEventListener('click', function () {
            currentGender = this.dataset.gender;
            document.querySelectorAll('.gender-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            loadMembersTable();
        });
    });

    // Setup search
    const searchInput = document.getElementById('memberSearch');
    if (searchInput) {
        searchInput.addEventListener('input', Utils.debounce(function () {
            loadMembersTable();
        }, 300));
    }

    // Setup add button
    const addBtn = document.getElementById('addMemberBtn');
    if (addBtn) {
        addBtn.addEventListener('click', showAddMemberForm);
    }

    // Setup status filter buttons
    const activeOnlyBtn = document.getElementById('activeOnlyBtn');
    const allMembersBtn = document.getElementById('allMembersBtn');

    if (activeOnlyBtn) {
        activeOnlyBtn.addEventListener('click', function () {
            memberStatusFilter = 'active';
            activeOnlyBtn.classList.remove('btn-secondary');
            activeOnlyBtn.classList.add('btn-primary');
            allMembersBtn.classList.remove('btn-primary');
            allMembersBtn.classList.add('btn-secondary');
            loadMembersTable(1);
        });
    }

    if (allMembersBtn) {
        allMembersBtn.addEventListener('click', function () {
            memberStatusFilter = null;
            updateFilterButtons(this);
            loadMembersTable(1);
        });
    }

    // Add Inactive Only Button Logic
    const inactiveOnlyBtn = document.getElementById('inactiveOnlyBtn');
    if (inactiveOnlyBtn) {
        inactiveOnlyBtn.addEventListener('click', function () {
            memberStatusFilter = 'inactive';
            updateFilterButtons(this);
            loadMembersTable(1);
        });
    }

    loadMembersTable(1); // Initial load of the members table
}

// End of DOMContentLoaded setup


function updateFilterButtons(activeBtn) {
    ['activeOnlyBtn', 'allMembersBtn', 'inactiveOnlyBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            if (btn === activeBtn) {
                btn.classList.remove('btn-secondary');
                btn.classList.add('btn-primary');
            } else {
                btn.classList.remove('btn-primary');
                btn.classList.add('btn-secondary');
            }
        }

    });
}


function loadMembersTable(page = 1) {
    // Ensure page is a number
    page = parseInt(page) || 1;

    const search = document.getElementById('memberSearch')?.value || '';
    const limit = 20;
    const statusParam = memberStatusFilter ? `&status=${memberStatusFilter}` : '';

    fetch(`api/members.php?action=list&gender=${currentGender}&page=${page}&limit=${limit}&search=${encodeURIComponent(search)}${statusParam}`)
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                renderMembersTable(data.data, data.pagination);
            } else {
                document.getElementById('membersTableContainer').innerHTML =
                    '<div class="error">Failed to load members</div>';
            }
        })
        .catch(err => {
            console.error('Members error:', err);
            document.getElementById('membersTableContainer').innerHTML =
                '<div class="error">Error loading members</div>';
        });
}

function renderMembersTable(members, pagination) {
    const currentPage = parseInt(pagination.page) || 1;
    const totalPages = parseInt(pagination.pages) || 1;
    const limit = parseInt(pagination.limit) || 20;
    const startIndex = (currentPage - 1) * limit;

    const html = `
        <div style="overflow-x: auto;">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Code</th>
                        <th>Name</th>
                        <th>Phone</th>
                        <th>Email</th>
                        <th>Join Date</th>
                        <th>Due Amount</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${members.map((m, idx) => `
                        <tr>
                            <td data-label="#">${startIndex + idx + 1}</td>
                            <td data-label="Code">${m.member_code}</td>
                            <td data-label="Name">${m.name}</td>
                            <td data-label="Phone">${m.phone}</td>
                            <td data-label="Email">${m.email || 'N/A'}</td>
                            <td data-label="Join Date">${Utils.formatDate(m.join_date)}</td>
                            <td data-label="Due Amount">${m.total_due_amount > 0 ? `<span style="color: red; font-weight: bold;">${Utils.formatCurrency(m.total_due_amount)}</span>` : '<span style="color: green;">No Due</span>'}</td>
                            <td data-label="Status"><span class="status-badge status-${m.status}">${m.status}</span></td>
                            <td data-label="Actions">
                                <button class="btn btn-sm btn-secondary" onclick="openMemberProfile('${m.member_code}', '${currentGender}')">View Profile</button>
                                <button class="btn btn-sm btn-primary" onclick="editMember(${m.id})">Edit</button>
                                <button class="btn btn-sm btn-success" onclick="updateFee(${m.id}, '${m.member_code}')">Update Fee</button>
                                <button class="btn btn-sm btn-danger" onclick="deleteMember(${m.id})">Delete</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        ${totalPages > 1 ? `
            <div class="pagination" style="margin-top: 1rem; display: flex; justify-content: center; align-items: center; gap: 1rem; flex-wrap: wrap;">
                <button class="btn btn-secondary" ${currentPage === 1 ? 'disabled' : ''} onclick="loadMembersTable(${currentPage - 1})">Previous</button>
                <span>Page</span>
                <input type="number" id="membersPageInput" min="1" max="${totalPages}" value="${currentPage}" style="width: 60px; padding: 0.25rem; text-align: center; border: 1px solid #ddd; border-radius: 4px;" onchange="const page = parseInt(this.value) || 1; if (page >= 1 && page <= ${totalPages}) loadMembersTable(page); else this.value = ${currentPage};" onkeypress="if(event.key === 'Enter') { const page = parseInt(this.value) || 1; if (page >= 1 && page <= ${totalPages}) loadMembersTable(page); else this.value = ${currentPage}; }">
                <span>of ${totalPages}</span>
                <button class="btn btn-secondary" ${currentPage === totalPages ? 'disabled' : ''} onclick="loadMembersTable(${currentPage + 1})">Next</button>
            </div>
        ` : ''}
    `;
    document.getElementById('membersTableContainer').innerHTML = html;
}

function showAddMemberForm() {
    const html = `
        <div class="modal" id="memberModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Add Member</h2>
                    <button class="modal-close" onclick="closeMemberModal()">&times;</button>
                </div>
                <form id="memberForm" class="modal-body">
                    <input type="hidden" id="memberId" name="id">
                    <div class="form-group">
                        <label>Member Code (Ac_No) *</label>
                        <input type="text" id="memberCode" name="member_code" required>
                    </div>
                        <div class="form-group">
                        <label>Name *</label>
                        <input type="text" id="memberName" name="name" required>
                    </div>
                    <div class="form-group">
                        <label>Phone *</label>
                        <input type="text" id="phone" name="phone" required>
                    </div>
                    <div class="form-group">
                        <label>RFID Card UID</label>
                        <div style="display: flex; gap: 10px;">
                            <input type="text" id="rfidUid" name="rfid_uid" placeholder="Scan or enter RFID card UID" style="flex: 1;">
                            <button type="button" class="btn btn-secondary" onclick="startRFIDScan()" id="scanRfidBtn">
                                <i class="fas fa-wifi"></i> Scan
                            </button>
                        </div>
                        <small id="scanStatus">Assign an RFID card to this member for gate automation (linked to this member code)</small>
                    </div>
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" id="email" name="email">
                    </div>
                    <div class="form-group">
                        <label>Address</label>
                        <textarea id="address" name="address"></textarea>
                    </div>
                    <div class="form-group">
                        <label>Profile Picture</label>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <input type="file" id="profileImage" name="profile_image" accept="image/*" style="flex: 1;">
                            <button type="button" class="btn btn-secondary" onclick="startCamera()" style="display: flex; align-items: center; gap: 5px;">
                                <i class="fas fa-camera"></i> Capture
                            </button>
                        </div>
                        <small>Accepted formats: JPG, PNG, GIF, WebP (Max 5MB)</small>
                        <div id="profileImagePreview" style="margin-top: 10px; display: none;">
                            <img id="previewImg" src="" alt="Preview" style="max-width: 150px; max-height: 150px; border-radius: 5px;">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Join Date *</label>
                            <input type="date" id="joinDate" name="join_date" required>
                        </div>
                        <div class="form-group">
                            <label>Membership Type</label>
                            <select id="membershipType" name="membership_type">
                                <option value="Basic">Basic</option>
                                <option value="Premium">Premium</option>
                                <option value="VIP">VIP</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Admission Fee</label>
                            <input type="number" step="0.01" id="admissionFee" name="admission_fee" value="0">
                        </div>
                        <div class="form-group">
                            <label>Monthly Fee</label>
                            <input type="number" step="0.01" id="monthlyFee" name="monthly_fee" value="0">
                        </div>
                        <div class="form-group">
                            <label>Locker Fee</label>
                            <input type="number" step="0.01" id="lockerFee" name="locker_fee" value="0">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Next Fee Due Date</label>
                        <input type="date" id="nextFeeDueDate" name="next_fee_due_date">
                    </div>
                    <div class="form-group">
                        <label>Status</label>
                        <select id="status" name="status">
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="closeMemberModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Save</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);

    const form = document.getElementById('memberForm');
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        saveMember();
    });

    // Profile image preview
    const profileImageInput = document.getElementById('profileImage');
    if (profileImageInput) {
        profileImageInput.addEventListener('change', function (e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    const preview = document.getElementById('profileImagePreview');
                    const previewImg = document.getElementById('previewImg');
                    previewImg.src = e.target.result;
                    preview.style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
        });
    }
}

function closeMemberModal() {
    const modal = document.getElementById('memberModal');
    if (modal) modal.remove();
}

function saveMember() {
    const profileImageInput = document.getElementById('profileImage');
    const hasImage = profileImageInput && profileImageInput.files.length > 0;
    const memberCodeValue = document.getElementById('memberCode')?.value || '';

    // If there's an image, upload it first
    if (hasImage) {
        const imageFormData = new FormData();
        imageFormData.append('image', profileImageInput.files[0]);
        imageFormData.append('gender', currentGender);
        imageFormData.append('member_code', memberCodeValue);

        fetch('api/upload-profile.php', {
            method: 'POST',
            body: imageFormData
        })
            .then(res => res.json())
            .then(imageData => {
                if (imageData.success) {
                    saveMemberData(imageData.path);
                } else {
                    Utils.showNotification(imageData.message || 'Failed to upload image', 'error');
                }
            })
            .catch(err => {
                console.error('Image upload error:', err);
                Utils.showNotification('Error uploading image', 'error');
            });
    } else {
        // No image, save member data directly
        const existingImage = document.getElementById('existingProfileImage')?.value || null;
        saveMemberData(existingImage);
    }
}

function saveMemberData(profileImagePath) {
    const formData = {
        id: document.getElementById('memberId').value || null,
        member_code: document.getElementById('memberCode').value,
        name: document.getElementById('memberName').value,
        phone: document.getElementById('phone').value,
        phone: document.getElementById('phone').value,
        rfid_uid: document.getElementById('rfidUid').value || null,
        email: document.getElementById('email').value || null,
        address: document.getElementById('address').value || null,
        profile_image: profileImagePath,
        join_date: document.getElementById('joinDate').value,
        membership_type: document.getElementById('membershipType').value,
        admission_fee: parseFloat(document.getElementById('admissionFee').value) || 0,
        monthly_fee: parseFloat(document.getElementById('monthlyFee').value) || 0,
        locker_fee: parseFloat(document.getElementById('lockerFee').value) || 0,
        next_fee_due_date: document.getElementById('nextFeeDueDate').value || null,
        status: document.getElementById('status').value
    };

    const action = formData.id ? 'update' : 'create';
    const url = `api/members.php?action=${action}&gender=${currentGender}`;

    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                Utils.showNotification(data.message || 'Member saved successfully', 'success');
                closeMemberModal();
                loadMembersTable();
            } else {
                Utils.showNotification(data.message || 'Failed to save member', 'error');
            }
        })
        .catch(err => {
            console.error('Save error:', err);
            Utils.showNotification('Error saving member', 'error');
        });
}

let isScanning = false;
let scanPollInterval = null;

function startRFIDScan() {
    if (isScanning) return;

    const btn = document.getElementById('scanRfidBtn');
    const statusFn = document.getElementById('scanStatus');
    const input = document.getElementById('rfidUid');

    isScanning = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scanning...';
    btn.disabled = true;
    statusFn.innerHTML = '<span style="color: #2196F3;">Listening for admin scanner... Flash card now.</span>';

    // Poll for 30 seconds
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds

    scanPollInterval = setInterval(() => {
        attempts++;

        // Stop after timeout
        if (attempts >= maxAttempts) {
            stopRFIDScan('Timeout: No card detected.', 'error');
            return;
        }

        fetch('api/rfid-assign.php?action=get_latest')
            .then(res => res.json())
            .then(data => {
                if (data.success && data.found && data.uid) {
                    // Check if timestamp is recent (within last 5 seconds)
                    const now = Math.floor(Date.now() / 1000);
                    if (now - data.timestamp < 10) {
                        input.value = data.uid;
                        stopRFIDScan('Card Scanned Successfully!', 'success');
                    }
                }
            })
            .catch(err => {
                console.error('Scan poll error:', err);
            });

    }, 1000);
}

function stopRFIDScan(message, type) {
    isScanning = false;
    clearInterval(scanPollInterval);

    const btn = document.getElementById('scanRfidBtn');
    const statusFn = document.getElementById('scanStatus');

    if (btn) {
        btn.innerHTML = '<i class="fas fa-wifi"></i> Scan';
        btn.disabled = false;
    }

    if (statusFn) {
        if (type === 'success') {
            statusFn.innerHTML = `<span style="color: #4CAF50;">${message}</span>`;
        } else {
            statusFn.innerHTML = `<span style="color: #f44336;">${message}</span>`;
        }
    }
}

function editMember(id) {
    fetch(`api/members.php?action=get&id=${id}&gender=${currentGender}`)
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showAddMemberForm();
                const m = data.data;
                document.getElementById('memberId').value = m.id;
                document.getElementById('memberCode').value = m.member_code;
                document.getElementById('memberName').value = m.name;
                document.getElementById('phone').value = m.phone;
                document.getElementById('rfidUid').value = m.rfid_uid || '';
                document.getElementById('email').value = m.email || '';
                document.getElementById('address').value = m.address || '';
                document.getElementById('joinDate').value = m.join_date;
                document.getElementById('membershipType').value = m.membership_type;
                document.getElementById('admissionFee').value = m.admission_fee;
                document.getElementById('monthlyFee').value = m.monthly_fee;
                document.getElementById('lockerFee').value = m.locker_fee;
                document.getElementById('nextFeeDueDate').value = m.next_fee_due_date || '';
                document.getElementById('status').value = m.status;

                // Show existing profile image if available
                if (m.profile_image) {
                    const preview = document.getElementById('profileImagePreview');
                    const previewImg = document.getElementById('previewImg');
                    previewImg.src = m.profile_image;
                    preview.style.display = 'block';
                    // Store existing image path
                    const existingInput = document.createElement('input');
                    existingInput.type = 'hidden';
                    existingInput.id = 'existingProfileImage';
                    existingInput.value = m.profile_image;
                    document.getElementById('memberForm').appendChild(existingInput);
                }

                // Update modal title
                document.querySelector('#memberModal .modal-header h2').textContent = 'Edit Member';
            }
        });
}

function deleteMember(id) {
    if (!confirm('Are you sure you want to delete this member?')) return;

    fetch(`api/members.php?action=delete&id=${id}&gender=${currentGender}`, {
        method: 'DELETE'
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                Utils.showNotification('Member deleted successfully', 'success');
                loadMembersTable();
            } else {
                Utils.showNotification(data.message || 'Failed to delete member', 'error');
            }
        });
}

function openMemberProfile(memberCode, gender) {
    if (!memberCode) return;

    // Choose correct profile page based on gender
    const profilePage = gender === 'women' ? 'member-profile-women.html' : 'member-profile-men.html';
    const url = `${profilePage}?code=${encodeURIComponent(memberCode)}`;

    // Open in new tab so admin can keep dashboard open
    window.open(url, '_blank');
}

function loadAttendance() {
    const html = `
        <div class="attendance-section">
            <div class="section-header">
                <div class="gender-tabs">
                    <button class="gender-tab ${currentGender === 'men' ? 'active' : ''}" data-gender="men">Men</button>
                    <button class="gender-tab ${currentGender === 'women' ? 'active' : ''}" data-gender="women">Women</button>
                </div>
                <div class="section-actions">
                    <input type="text" id="attendanceMemberCode" placeholder="Enter Member Code" class="search-input">
                    <button class="btn btn-primary" id="checkInBtn">Check In</button>
                </div>
            </div>
            <div id="attendanceTableContainer"></div>
        </div>
    `;
    document.getElementById('contentBody').innerHTML = html;

    document.querySelectorAll('.gender-tab').forEach(tab => {
        tab.addEventListener('click', function () {
            currentGender = this.dataset.gender;
            document.querySelectorAll('.gender-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            loadAttendanceTable();
        });
    });

    const checkInBtn = document.getElementById('checkInBtn');
    if (checkInBtn) {
        checkInBtn.addEventListener('click', handleCheckIn);
    }

    const memberCodeInput = document.getElementById('attendanceMemberCode');
    if (memberCodeInput) {
        memberCodeInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                handleCheckIn();
            }
        });
    }

    loadAttendanceTable();
}

function handleCheckIn() {
    const memberCode = document.getElementById('attendanceMemberCode').value.trim();
    if (!memberCode) {
        Utils.showNotification('Please enter member code', 'error');
        return;
    }

    // Search in both genders to find the member
    // Try men first
    fetch(`api/members.php?action=getByCode&code=${encodeURIComponent(memberCode)}&gender=men`)
        .then(res => {
            if (!res.ok) {
                throw new Error('Network error');
            }
            return res.json();
        })
        .then(data => {
            let memberId = null;
            let memberGender = null;

            if (data.success && data.data) {
                memberId = data.data.id;
                memberGender = 'men';
            } else {
                // Try women
                return fetch(`api/members.php?action=getByCode&code=${encodeURIComponent(memberCode)}&gender=women`)
                    .then(res => {
                        if (!res.ok) {
                            throw new Error('Network error');
                        }
                        return res.json();
                    })
                    .then(womenData => {
                        if (womenData.success && womenData.data) {
                            memberId = womenData.data.id;
                            memberGender = 'women';
                        }
                        return { memberId, memberGender };
                    });
            }

            return { memberId, memberGender };
        })
        .then(({ memberId, memberGender }) => {
            if (!memberId || !memberGender) {
                Utils.showNotification('Member not found. Please check the member code.', 'error');
                return;
            }

            // Update gender tab if needed
            if (memberGender !== currentGender) {
                currentGender = memberGender;
                document.querySelectorAll('.gender-tab').forEach(t => t.classList.remove('active'));
                document.querySelector(`.gender-tab[data-gender="${memberGender}"]`)?.classList.add('active');
            }

            // Check in
            fetch('api/attendance-checkin.php?action=checkin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    member_id: memberId,
                    gender: memberGender
                })
            })
                .then(res => {
                    if (!res.ok) {
                        return res.text().then(text => {
                            try {
                                return JSON.parse(text);
                            } catch {
                                throw new Error('Network error: ' + text.substring(0, 100));
                            }
                        });
                    }
                    return res.json();
                })
                .then(result => {
                    if (result.success) {
                        Utils.showNotification('Check-in recorded successfully', 'success');
                        document.getElementById('attendanceMemberCode').value = '';
                        loadAttendanceTable();
                    } else {
                        Utils.showNotification(result.message || 'Failed to record check-in', 'error');
                    }
                })
                .catch(error => {
                    console.error('Check-in error:', error);
                    Utils.showNotification('Failed to record check-in: ' + error.message, 'error');
                });
        })
        .catch(error => {
            console.error('Member lookup error:', error);
            Utils.showNotification('Failed to lookup member. Please try again.', 'error');
        });
}

function loadAttendanceTable(page = 1) {
    // Cancel previous in-flight request for attendance
    if (activeRequests['attendance']) {
        activeRequests['attendance'].abort();
    }
    const abortController = new AbortController();
    activeRequests['attendance'] = abortController;

    fetch(`api/attendance.php?action=list&gender=${currentGender}&page=${page}`, { signal: abortController.signal })
        .then(async res => {
            if (abortController.signal.aborted) return null;
            const text = await res.text();
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
            }
            if (!text) {
                throw new Error('Empty response from server');
            }
            try {
                return JSON.parse(text);
            } catch (e) {
                throw new Error('Invalid JSON response: ' + text.substring(0, 100));
            }
        })
        .then(data => {
            if (abortController.signal.aborted) return;
            if (!data) return;
            if (data.success) {
                const pagination = data.pagination || { page: 1, limit: 20 };
                const currentPage = parseInt(pagination.page) || 1;
                const limit = parseInt(pagination.limit) || 20;
                const startIndex = (currentPage - 1) * limit;

                const html = `
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Member Code</th>
                                <th>Name</th>
                                <th>Check In</th>
                                <th>Check Out</th>
                                <th>Duration</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.data.map((a, idx) => `
                                <tr>
                                    <td data-label="#">${startIndex + idx + 1}</td>
                                    <td data-label="Member Code">${a.member_code}</td>
                                    <td data-label="Name">${a.name}</td>
                                    <td data-label="Check In">${new Date(a.check_in).toLocaleString()}</td>
                                    <td data-label="Check Out">${a.check_out ? new Date(a.check_out).toLocaleString() : '<span style="color: orange;">In Progress</span>'}</td>
                                    <td data-label="Duration">${a.duration_minutes ? a.duration_minutes + ' min' : 'N/A'}</td>
                                    <td data-label="Actions">
                                        ${!a.check_out ? `<button class="btn btn-sm btn-primary" onclick="checkOut(${a.id})">Check Out</button>` : ''}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;
                document.getElementById('attendanceTableContainer').innerHTML = html;
            } else {
                document.getElementById('attendanceTableContainer').innerHTML = `<div class="error">${data.message || 'Failed to load attendance'}</div>`;
            }
        })
        .catch(error => {
            if (abortController.signal.aborted) return;
            console.error('Attendance table error:', error);
            document.getElementById('attendanceTableContainer').innerHTML = `<div class="error">Error loading attendance: ${error.message}</div>`;
        });
}

function checkOut(attendanceId) {
    fetch('api/attendance-checkin.php?action=checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            attendance_id: attendanceId,
            gender: currentGender
        })
    })
        .then(res => {
            if (!res.ok) {
                return res.text().then(text => {
                    try {
                        return JSON.parse(text);
                    } catch {
                        throw new Error('Network error: ' + text.substring(0, 100));
                    }
                });
            }
            return res.json();
        })
        .then(data => {
            if (data.success) {
                Utils.showNotification('Check-out recorded successfully', 'success');
                loadAttendanceTable();
            } else {
                Utils.showNotification(data.message || 'Failed to record check-out', 'error');
            }
        })
        .catch(error => {
            console.error('Check-out error:', error);
            Utils.showNotification('Failed to record check-out: ' + error.message, 'error');
        });
}

let paymentsViewMode = 'current'; // 'current' or 'history'
let paymentsSelectedMonth = new Date().getMonth() + 1;
let paymentsSelectedYear = new Date().getFullYear();

let expensesViewMode = 'current'; // 'current' or 'history'
let expensesSelectedMonth = new Date().getMonth() + 1;
let expensesSelectedYear = new Date().getFullYear();

function loadPayments() {
    const html = `
        <div class="payments-section">
            <div class="section-header">
                <div class="gender-tabs">
                    <button class="gender-tab ${currentGender === 'men' ? 'active' : ''}" data-gender="men">Men</button>
                    <button class="gender-tab ${currentGender === 'women' ? 'active' : ''}" data-gender="women">Women</button>
                </div>
                <div class="section-actions">
                    <input type="text" id="paymentSearch" placeholder="Search by member code, name, invoice..." class="search-input">
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <button class="btn ${paymentsViewMode === 'current' ? 'btn-primary' : 'btn-secondary'}" id="viewCurrentBtn">Current Month</button>
                        <button class="btn ${paymentsViewMode === 'history' ? 'btn-primary' : 'btn-secondary'}" id="viewHistoryBtn">View History</button>
                    </div>
                    <div id="historySelector" style="display: ${paymentsViewMode === 'history' ? 'flex' : 'none'}; gap: 0.5rem; align-items: center; margin-left: 0.5rem;">
                        <select id="paymentMonth" class="search-input" style="width: auto;">
                            ${Array.from({ length: 12 }, (_, i) => {
        const month = i + 1;
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        return `<option value="${month}" ${month === paymentsSelectedMonth ? 'selected' : ''}>${monthNames[i]}</option>`;
    }).join('')}
                        </select>
                        <select id="paymentYear" class="search-input" style="width: auto;">
                            ${Array.from({ length: 5 }, (_, i) => {
        const year = new Date().getFullYear() - i;
        return `<option value="${year}" ${year === paymentsSelectedYear ? 'selected' : ''}>${year}</option>`;
    }).join('')}
                        </select>
                        <button class="btn btn-primary" id="loadHistoryBtn">Load</button>
                    </div>
                    <button class="btn ${paymentsDefaultersFilter ? 'btn-warning' : 'btn-secondary'}" id="showDefaultersBtn">Show Defaulters</button>
                    <button class="btn ${memberStatusFilter === 'inactive' ? 'btn-primary' : 'btn-secondary'}" id="showInactivePaymentsBtn">Inactive Members</button>
                    <button class="btn btn-primary" id="addPaymentBtn">Record Payment</button>
                </div>
            </div>
            <div id="paymentsTableContainer"></div>
        </div>
    `;
    document.getElementById('contentBody').innerHTML = html;

    document.querySelectorAll('.gender-tab').forEach(tab => {
        tab.addEventListener('click', function () {
            currentGender = this.dataset.gender;
            document.querySelectorAll('.gender-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            loadPaymentsTable();
        });
    });

    const addPaymentBtn = document.getElementById('addPaymentBtn');
    if (addPaymentBtn) {
        addPaymentBtn.addEventListener('click', showAddPaymentForm);
    }

    const viewCurrentBtn = document.getElementById('viewCurrentBtn');
    const viewHistoryBtn = document.getElementById('viewHistoryBtn');
    const historySelector = document.getElementById('historySelector');
    const loadHistoryBtn = document.getElementById('loadHistoryBtn');
    const paymentMonth = document.getElementById('paymentMonth');
    const paymentYear = document.getElementById('paymentYear');

    if (viewCurrentBtn) {
        viewCurrentBtn.addEventListener('click', function () {
            paymentsViewMode = 'current';
            viewCurrentBtn.classList.remove('btn-secondary');
            viewCurrentBtn.classList.add('btn-primary');
            viewHistoryBtn.classList.remove('btn-primary');
            viewHistoryBtn.classList.add('btn-secondary');
            historySelector.style.display = 'none';
            loadPaymentsTable();
        });
    }

    if (viewHistoryBtn) {
        viewHistoryBtn.addEventListener('click', function () {
            paymentsViewMode = 'history';
            viewHistoryBtn.classList.remove('btn-secondary');
            viewHistoryBtn.classList.add('btn-primary');
            viewCurrentBtn.classList.remove('btn-primary');
            viewCurrentBtn.classList.add('btn-secondary');
            historySelector.style.display = 'flex';
        });
    }

    if (loadHistoryBtn) {
        loadHistoryBtn.addEventListener('click', function () {
            paymentsSelectedMonth = parseInt(paymentMonth.value);
            paymentsSelectedYear = parseInt(paymentYear.value);
            loadPaymentsTable();
        });
    }

    // Setup search
    const searchInput = document.getElementById('paymentSearch');
    if (searchInput) {
        searchInput.addEventListener('input', Utils.debounce(function () {
            loadPaymentsTable();
        }, 300));
    }

    // Setup defaulters button
    const showDefaultersBtn = document.getElementById('showDefaultersBtn');
    if (showDefaultersBtn) {
        showDefaultersBtn.addEventListener('click', function () {
            paymentsDefaultersFilter = !paymentsDefaultersFilter;
            if (paymentsDefaultersFilter) {
                showDefaultersBtn.classList.remove('btn-secondary');
                showDefaultersBtn.classList.add('btn-warning');
                showDefaultersBtn.textContent = 'Show Regular Payments';
            } else {
                showDefaultersBtn.classList.remove('btn-warning');
                showDefaultersBtn.classList.add('btn-secondary');
                showDefaultersBtn.textContent = 'Show Defaulters';
            }
            loadPaymentsTable(1);
        });
    }

    // Setup Inactive Payments Button
    const showInactivePaymentsBtn = document.getElementById('showInactivePaymentsBtn');
    if (showInactivePaymentsBtn) {
        showInactivePaymentsBtn.addEventListener('click', function () {
            if (memberStatusFilter === 'inactive') {
                memberStatusFilter = null; // Toggle off
                showInactivePaymentsBtn.classList.remove('btn-primary');
                showInactivePaymentsBtn.classList.add('btn-secondary');
            } else {
                memberStatusFilter = 'inactive'; // Toggle on
                showInactivePaymentsBtn.classList.remove('btn-secondary');
                showInactivePaymentsBtn.classList.add('btn-primary');
            }
            loadPaymentsTable(1);
        });
    }

    loadPaymentsTable();
}

function showAddPaymentForm() {
    const html = `
        <div class="modal" id="paymentModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Record Payment</h2>
                    <button class="modal-close" onclick="closePaymentModal()">&times;</button>
                </div>
                <form id="paymentForm" class="modal-body">
                    <div class="form-group">
                        <label>Member Code *</label>
                        <input type="text" id="paymentMemberCode" name="member_code" required>
                    </div>
                    <div class="form-group">
                        <label>Amount *</label>
                        <input type="number" step="0.01" id="paymentAmount" name="amount" required>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Payment Date *</label>
                            <input type="date" id="paymentDate" name="payment_date" required>
                        </div>
                        <div class="form-group">
                            <label>Due Date</label>
                            <input type="date" id="dueDate" name="due_date">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Invoice Number</label>
                        <input type="text" id="invoiceNumber" name="invoice_number">
                    </div>
                    <div class="form-group">
                        <label>Status</label>
                        <select id="paymentStatus" name="status">
                            <option value="completed">Completed</option>
                            <option value="pending">Pending</option>
                        </select>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Received By</label>
                            <select id="paymentReceivedBy" name="received_by">
                                <option value="Admin One">Admin One</option>
                                <option value="Admin Two">Admin Two</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Payment Method</label>
                            <select id="paymentMethod" name="payment_method">
                                <option value="Cash">Cash</option>
                                <option value="Online">Online</option>
                            </select>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="closePaymentModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Save</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);

    // Set today's date as default
    document.getElementById('paymentDate').valueAsDate = new Date();

    const form = document.getElementById('paymentForm');
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        savePayment();
    });
}

function closePaymentModal() {
    const modal = document.getElementById('paymentModal');
    if (modal) modal.remove();
}

function savePayment() {
    const memberCode = document.getElementById('paymentMemberCode').value.trim();

    // Get member ID
    fetch(`api/members.php?action=getByCode&code=${encodeURIComponent(memberCode)}&gender=${currentGender}`)
        .then(res => res.json())
        .then(memberData => {
            if (!memberData.success) {
                Utils.showNotification('Member not found', 'error');
                return;
            }

            const paymentData = {
                member_id: memberData.data.id,
                amount: parseFloat(document.getElementById('paymentAmount').value),
                payment_date: document.getElementById('paymentDate').value,
                due_date: document.getElementById('dueDate').value || null,
                invoice_number: document.getElementById('invoiceNumber').value || null,
                status: document.getElementById('paymentStatus').value,
                received_by: document.getElementById('paymentReceivedBy').value,
                payment_method: document.getElementById('paymentMethod').value
            };

            fetch(`api/payments.php?action=create&gender=${currentGender}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(paymentData)
            })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        Utils.showNotification('Payment recorded successfully', 'success');
                        closePaymentModal();
                        loadPaymentsTable();
                    } else {
                        Utils.showNotification(data.message || 'Failed to record payment', 'error');
                    }
                })
                .catch(err => {
                    console.error('Payment error:', err);
                    Utils.showNotification('Error recording payment', 'error');
                });
        });
}

function loadPaymentsTable(page = 1) {
    // Cancel previous in-flight request for payments
    if (activeRequests['payments']) {
        activeRequests['payments'].abort();
    }
    const abortController = new AbortController();
    activeRequests['payments'] = abortController;

    // Ensure page is a number
    page = parseInt(page) || 1;

    const month = paymentsViewMode === 'current' ? new Date().getMonth() + 1 : paymentsSelectedMonth;
    const year = paymentsViewMode === 'current' ? new Date().getFullYear() : paymentsSelectedYear;
    const search = document.getElementById('paymentSearch')?.value || '';
    const defaultersParam = paymentsDefaultersFilter ? '&defaulters=1' : '';
    const statusParam = memberStatusFilter ? `&status=${memberStatusFilter}` : '';

    const container = document.getElementById('paymentsTableContainer');
    if (!container) return;

    container.innerHTML = '<div class="loading">Loading payments...</div>';

    fetch(`api/payments.php?action=list&gender=${currentGender}&page=${page}&month=${month}&year=${year}&search=${encodeURIComponent(search)}${defaultersParam}${statusParam}`, { signal: abortController.signal })
        .then(async res => {
            const text = await res.text();
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
            }
            if (!text) {
                throw new Error('Empty response from server');
            }
            try {
                return JSON.parse(text);
            } catch (e) {
                throw new Error('Invalid JSON response: ' + text.substring(0, 100));
            }
        })
        .then(data => {
            if (abortController.signal.aborted) return;
            // Re-check container exists before setting innerHTML
            const container = document.getElementById('paymentsTableContainer');
            if (!container) {
                console.warn('Payments table container not found');
                return;
            }

            if (data && data.success) {
                let html = '';

                if (data.defaulters) {
                    // Defaulters view
                    html = `
                        <div style="margin-bottom: 1rem;">
                            <h3>Defaulters (Active members not paid for 1+ month)</h3>
                            <p>Total Defaulters: ${data.pagination.total}</p>
                        </div>
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Member Code</th>
                                    <th>Name</th>
                                    <th>Monthly Fee</th>
                                    <th>Total Due</th>
                                    <th>Last Payment Date</th>
                                    <th>Days Since Payment</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.data.length > 0 ? data.data.map((p, idx) => {
                        const daysSince = parseInt(p.days_since_payment) || 0;
                        return `
                                    <tr>
                                        <td data-label="#">${((parseInt(data.pagination.page) || 1) - 1) * (parseInt(data.pagination.limit) || 20) + idx + 1}</td>
                                        <td data-label="Member Code">${p.member_code}</td>
                                        <td data-label="Name">${p.name}</td>
                                        <td data-label="Monthly Fee">${Utils.formatCurrency(p.monthly_fee || 0)}</td>
                                        <td data-label="Total Due"><span style="color: red; font-weight: bold;">${Utils.formatCurrency(p.total_due_amount || 0)}</span></td>
                                        <td data-label="Last Payment">${p.last_payment_date ? Utils.formatDate(p.last_payment_date) : 'Never'}</td>
                                        <td data-label="Days Since"><span style="color: ${daysSince > 60 ? 'red' : 'orange'}; font-weight: bold;">${daysSince} days</span></td>
                                        <td data-label="Status"><span class="status-badge status-${p.status}">${p.status}</span></td>
                                    </tr>
                                `;
                    }).join('') : '<tr><td colspan="7" style="text-align: center;">No defaulters found</td></tr>'}
                            </tbody>
                        </table>
                    `;
                } else {
                    // Regular payments view
                    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
                    html = `
                        <div style="margin-bottom: 1rem;">
                            <h3>Payments for ${monthNames[data.month - 1]} ${data.year}</h3>
                            <p>Total Payments: ${data.pagination.total}</p>
                        </div>
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Member Code</th>
                                    <th>Name</th>
                                    <th>Amount Paid</th>
                                    <th>Remaining Due</th>
                                    <th>Payment Date</th>
                                    <th>Method</th>
                                    <th>Receiver</th>
                                    <th>Due Date</th>
                                    <th>Invoice #</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.data.length > 0 ? data.data.map((p, idx) => {
                        const remainingDue = parseFloat(p.remaining_amount) || 0;
                        return `
                                    <tr>
                                        <td data-label="#">${((parseInt(data.pagination.page) || 1) - 1) * (parseInt(data.pagination.limit) || 20) + idx + 1}</td>
                                        <td data-label="Member Code">${p.member_code}</td>
                                        <td data-label="Name">${p.name}</td>
                                        <td data-label="Amount Paid"><strong>${Utils.formatCurrency(p.amount)}</strong></td>
                                        <td data-label="Remaining Due">${remainingDue > 0 ? `<span style="color: red; font-weight: bold;">${Utils.formatCurrency(remainingDue)}</span>` : '<span style="color: green;">Paid</span>'}</td>
                                        <td data-label="Payment Date">${Utils.formatDate(p.payment_date)}</td>
                                        <td data-label="Method">${p.payment_method || 'Cash'}</td>
                                        <td data-label="Receiver">${p.received_by || '-'}</td>
                                        <td data-label="Due Date">${p.due_date ? Utils.formatDate(p.due_date) : 'N/A'}</td>
                                        <td data-label="Invoice #">${p.invoice_number || 'N/A'}</td>
                                        <td data-label="Status"><span class="status-badge status-${p.status}">${p.status}</span></td>
                                    </tr>
                                `;
                    }).join('') : '<tr><td colspan="8" style="text-align: center;">No payments found for this month</td></tr>'}
                            </tbody>
                        </table>
                    `;
                }

                // Add pagination
                if (data.pagination.pages > 1) {
                    const currentPage = parseInt(data.pagination.page) || 1;
                    const totalPages = parseInt(data.pagination.pages) || 1;
                    html += `
                        <div class="pagination" style="margin-top: 1rem; display: flex; justify-content: center; align-items: center; gap: 1rem; flex-wrap: wrap;">
                            <button ${currentPage === 1 ? 'disabled' : ''} onclick="loadPaymentsTable(${currentPage - 1})">Previous</button>
                            <span>Page</span>
                            <input type="number" id="paymentsPageInput" min="1" max="${totalPages}" value="${currentPage}" style="width: 60px; padding: 0.25rem; text-align: center; border: 1px solid #ddd; border-radius: 4px;" onchange="const page = parseInt(this.value) || 1; if (page >= 1 && page <= ${totalPages}) loadPaymentsTable(page); else this.value = ${currentPage};" onkeypress="if(event.key === 'Enter') { const page = parseInt(this.value) || 1; if (page >= 1 && page <= ${totalPages}) loadPaymentsTable(page); else this.value = ${currentPage}; }">
                            <span>of ${totalPages}</span>
                            <button ${currentPage === totalPages ? 'disabled' : ''} onclick="loadPaymentsTable(${currentPage + 1})">Next</button>
                        </div>
                    `;
                }

                container.innerHTML = html;
            } else {
                container.innerHTML = '<div class="error">Failed to load payments: ' + (data?.message || 'Unknown error') + '</div>';
            }
        })
        .catch(err => {
            console.error('Payments error:', err);
            const container = document.getElementById('paymentsTableContainer');
            if (container) {
                container.innerHTML = `<div class="error">Error loading payments: ${err.message}</div>`;
            }
        });
}

function updateFee(memberId, memberCode) {
    // Get member details first
    fetch(`api/members.php?action=get&id=${memberId}&gender=${currentGender}`)
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const member = data.data;
                showUpdateFeeForm(member);
            }
        });
}

function showUpdateFeeForm(member) {
    const html = `
        <div class="modal" id="updateFeeModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Update Fee - ${member.member_code}</h2>
                    <button class="modal-close" onclick="closeUpdateFeeModal()">&times;</button>
                </div>
                <form id="updateFeeForm" class="modal-body">
                    <input type="hidden" id="feeMemberId" value="${member.id}">
                    <div class="form-group">
                        <label>Member: <strong>${member.name}</strong></label>
                    </div>
                    <div class="form-group">
                        <label>Join Date: ${Utils.formatDate(member.join_date)}</label>
                    </div>
                    <div class="form-group">
                        <label>Monthly Fee: <strong>${Utils.formatCurrency(member.monthly_fee)}</strong></label>
                    </div>
                    ${member.total_due_amount > 0 ? `
                    <div class="form-group" style="background: rgba(255, 193, 7, 0.2); padding: 1rem; border-radius: 5px; border-left: 4px solid #ffc107;">
                        <label><strong style="color: #ffc107;">⚠️ Previous Due Amount: ${Utils.formatCurrency(member.total_due_amount)}</strong></label>
                        <p style="margin: 0.5rem 0 0 0; font-size: 0.9rem; color: #ffc107;">
                            This amount will be added to the monthly fee when payment is made.
                        </p>
                    </div>
                    ` : ''}
                    <div class="form-group" style="background: rgba(33, 150, 243, 0.2); padding: 1rem; border-radius: 5px; border-left: 4px solid #2196F3;">
                        <label><strong style="color: #2196F3;">Total Amount Due:</strong></label>
                        <p style="margin: 0.5rem 0; font-size: 1.2rem; font-weight: bold; color: #64b5f6;">
                            ${Utils.formatCurrency((parseFloat(member.total_due_amount) || 0) + parseFloat(member.monthly_fee) || 0)} 
                            <small style="font-size: 0.9rem; font-weight: normal;">
                                (Previous Due: ${Utils.formatCurrency(member.total_due_amount || 0)} + Monthly Fee: ${Utils.formatCurrency(member.monthly_fee || 0)})
                            </small>
                        </p>
                    </div>
                    <div class="form-group">
                        <label>Amount to Pay *</label>
                        <input type="number" step="0.01" id="feeAmount" name="amount" value="${(parseFloat(member.total_due_amount) || 0) + parseFloat(member.monthly_fee) || 0}" required>
                        <small style="color: #d1d5db;">
                            ${member.total_due_amount > 0 ?
            `Enter amount to pay. To pay in full, enter ${Utils.formatCurrency((parseFloat(member.total_due_amount) || 0) + parseFloat(member.monthly_fee) || 0)} (includes previous due + monthly fee). This full amount will be added to revenue.` :
            'Enter the payment amount (default is monthly fee).'}
                        </small>
                    </div>
                    <div id="paymentCalculation" style="background: rgba(37, 43, 74, 0.6); color: #ffffff; padding: 0.75rem; border-radius: 5px; margin-top: 0.5rem; font-size: 0.9rem; border: 1px solid var(--border-color);">
                        <strong>Payment Breakdown:</strong>
                        <div id="calcDetails" style="margin-top: 0.25rem; color: #d1d5db;">
                            ${member.total_due_amount > 0 ?
            `Previous Due: ${Utils.formatCurrency(member.total_due_amount)}<br>
                                 Monthly Fee: ${Utils.formatCurrency(member.monthly_fee)}<br>
                                 <strong>Total to Pay: ${Utils.formatCurrency((parseFloat(member.total_due_amount) || 0) + parseFloat(member.monthly_fee) || 0)}</strong>` :
            `Monthly Fee: ${Utils.formatCurrency(member.monthly_fee)}`}
                        </div>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="isPartialPayment" name="is_partial_payment">
                            This is a partial payment (some amount will remain due)
                        </label>
                    </div>
                    <div class="form-group">
                        <label>Received By *</label>
                        <div style="display: flex; gap: 1rem; margin-top: 0.5rem;">
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input type="radio" name="received_by" value="Admin 1" required> Admin 1
                            </label>
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input type="radio" name="received_by" value="Admin 2"> Admin 2
                            </label>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Payment Method *</label>
                        <div style="display: flex; gap: 1rem; margin-top: 0.5rem;">
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input type="radio" name="payment_method" value="Cash" checked> Cash
                            </label>
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input type="radio" name="payment_method" value="Online"> Online
                            </label>
                        </div>
                    </div>
                    <div class="form-group" id="dueAmountGroup" style="display: none;">
                        <label>Remaining Due Amount *</label>
                        <input type="number" step="0.01" id="dueAmount" name="due_amount" value="0" min="0">
                        <small>Enter the amount that will remain due after this payment</small>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="isDefaulterUpdate" name="is_defaulter_update">
                            Update to new defaulter date (for fee defaulters)
                        </label>
                    </div>
                    <div class="form-group" id="defaulterDateGroup" style="display: none;">
                        <label>New Defaulter Date *</label>
                        <input type="date" id="newDefaulterDate" name="new_defaulter_date">
                    </div>
                    <div class="form-group">
                        <label>Note: Normal update calculates next fee date based on join date. Defaulter update uses the date you specify. Partial payment allows recording remaining due amount.</label>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="closeUpdateFeeModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Update Fee</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);

    const form = document.getElementById('updateFeeForm');
    const partialPaymentCheckbox = document.getElementById('isPartialPayment');
    const dueAmountGroup = document.getElementById('dueAmountGroup');
    const dueAmountInput = document.getElementById('dueAmount');
    const defaulterCheckbox = document.getElementById('isDefaulterUpdate');
    const defaulterDateGroup = document.getElementById('defaulterDateGroup');
    const defaulterDateInput = document.getElementById('newDefaulterDate');

    // Auto-calculate payment amount when partial payment checkbox changes
    const feeAmountInput = document.getElementById('feeAmount');
    const calcDetails = document.getElementById('calcDetails');
    const totalDue = (parseFloat(member.total_due_amount) || 0) + parseFloat(member.monthly_fee) || 0;

    // Function to update calculation display
    function updateCalculation() {
        const paymentAmount = parseFloat(feeAmountInput.value) || 0;
        const prevDue = parseFloat(member.total_due_amount) || 0;
        const monthlyFee = parseFloat(member.monthly_fee) || 0;

        if (prevDue > 0) {
            if (partialPaymentCheckbox.checked) {
                const remaining = parseFloat(dueAmountInput.value) || 0;
                calcDetails.innerHTML = `
                    Previous Due: ${Utils.formatCurrency(prevDue)}<br>
                    Monthly Fee: ${Utils.formatCurrency(monthlyFee)}<br>
                    Payment Made: ${Utils.formatCurrency(paymentAmount)}<br>
                    Remaining Due: <strong style="color: red;">${Utils.formatCurrency(remaining)}</strong>
                `;
            } else {
                const remaining = Math.max(0, totalDue - paymentAmount);
                calcDetails.innerHTML = `
                    Previous Due: ${Utils.formatCurrency(prevDue)}<br>
                    Monthly Fee: ${Utils.formatCurrency(monthlyFee)}<br>
                    Payment Made: ${Utils.formatCurrency(paymentAmount)}<br>
                    ${remaining > 0 ?
                        `<strong style="color: red;">Remaining Due: ${Utils.formatCurrency(remaining)}</strong>` :
                        '<strong style="color: green;">✅ Paid in Full</strong>'}
                `;
            }
        } else {
            calcDetails.innerHTML = `Monthly Fee: ${Utils.formatCurrency(monthlyFee)}`;
        }
    }

    partialPaymentCheckbox.addEventListener('change', function () {
        if (this.checked) {
            dueAmountGroup.style.display = 'block';
            dueAmountInput.required = true;
            // When partial payment, default to monthly fee only
            feeAmountInput.value = member.monthly_fee;
            updateCalculation();
        } else {
            dueAmountGroup.style.display = 'none';
            dueAmountInput.required = false;
            dueAmountInput.value = 0;
            // When full payment, default to total due (previous + monthly fee)
            feeAmountInput.value = totalDue;
            updateCalculation();
        }
    });

    // Update calculation when payment amount changes
    feeAmountInput.addEventListener('input', function () {
        if (partialPaymentCheckbox.checked) {
            const paymentAmount = parseFloat(this.value) || 0;
            const remaining = Math.max(0, totalDue - paymentAmount);
            dueAmountInput.value = remaining.toFixed(2);
        }
        updateCalculation();
    });

    // Update calculation when due amount changes (for partial payments)
    dueAmountInput.addEventListener('input', function () {
        updateCalculation();
    });

    // Initial calculation
    updateCalculation();

    defaulterCheckbox.addEventListener('change', function () {
        if (this.checked) {
            defaulterDateGroup.style.display = 'block';
            defaulterDateInput.required = true;
        } else {
            defaulterDateGroup.style.display = 'none';
            defaulterDateInput.required = false;
        }
    });

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        saveFeeUpdate();
    });
}

function closeUpdateFeeModal() {
    const modal = document.getElementById('updateFeeModal');
    if (modal) modal.remove();
}

function saveFeeUpdate() {
    const memberId = document.getElementById('feeMemberId').value;
    const amount = parseFloat(document.getElementById('feeAmount').value);
    const isPartialPayment = document.getElementById('isPartialPayment').checked;
    const dueAmount = parseFloat(document.getElementById('dueAmount').value) || 0;
    const isDefaulterUpdate = document.getElementById('isDefaulterUpdate').checked;
    const newDefaulterDate = document.getElementById('newDefaulterDate').value;

    // Get radio values
    const receivedBy = document.querySelector('input[name="received_by"]:checked')?.value;
    const paymentMethod = document.querySelector('input[name="payment_method"]:checked')?.value;

    if (!receivedBy) {
        Utils.showNotification('Please select who received the payment (Admin 1 or Admin 2)', 'error');
        return;
    }

    if (isPartialPayment && dueAmount <= 0) {
        Utils.showNotification('Please enter due amount for partial payment', 'error');
        return;
    }

    if (isDefaulterUpdate && !newDefaulterDate) {
        Utils.showNotification('Please select a new defaulter date', 'error');
        return;
    }

    const feeData = {
        member_id: memberId,
        gender: currentGender,
        amount: amount,
        is_partial_payment: isPartialPayment,

        due_amount: isPartialPayment ? dueAmount : 0,
        is_defaulter_update: isDefaulterUpdate,
        new_defaulter_date: isDefaulterUpdate ? newDefaulterDate : null,
        received_by: receivedBy,
        payment_method: paymentMethod
    };

    fetch('api/update-fee.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feeData)
    })
        // Log The JSON Data
        .then(async res => {
            // Response received
            // Check if response is OK
            if (!res.ok) {
                // Try to get error message from response
                let errorMessage = 'Failed to update fee';
                try {
                    const errorData = await res.json();
                    errorMessage = errorData.message || errorMessage;
                } catch (e) {
                    // If response is not JSON, use status text
                    errorMessage = `Error ${res.status}: ${res.statusText || 'Server error'}`;
                }
                throw new Error(errorMessage);
            }

            // Check if response has content
            const contentType = res.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error('Invalid response format from server');
            }

            // Get response text first to check if it's empty
            const text = await res.text();
            if (!text || text.trim() === '') {
                throw new Error('Empty response from server');
            }

            // Parse JSON
            try {
                return JSON.parse(text);
            } catch (e) {
                console.error('Invalid JSON response:', text);
                throw new Error('Invalid JSON response from server');
            }
        })
        .then(data => {
            if (data.success) {
                const message = data.message || 'Fee updated successfully';
                Utils.showNotification(message, 'success');
                closeUpdateFeeModal();

                // Always refresh these tables after fee update
                loadMembersTable(); // Refresh member list to show updated due amounts

                // Refresh payments table - wait a moment to ensure payment is saved
                setTimeout(() => {
                    loadPaymentsTable();
                }, 500);

                // Refresh due fees table if it exists
                if (document.getElementById('dueFeesTableContainer')) {
                    setTimeout(() => {
                        loadDueFeesTable();
                    }, 500);
                }

                // If on dashboard, refresh it too to update revenue
                if (document.getElementById('dashboard-stats')) {
                    setTimeout(() => {
                        loadDashboard();
                    }, 500);
                }
            } else {
                Utils.showNotification(data.message || 'Failed to update fee', 'error');
            }
        })
        .catch(err => {
            console.error('Fee update error:', err);
            Utils.showNotification(err.message || 'Error updating fee', 'error');
        });
}

function loadDueFees() {
    const html = `
        <div class="due-fees-section">
            <div class="section-header">
                <h2>Due Fees Management</h2>
                <div class="section-actions">
                    <input type="text" id="dueFeeSearch" placeholder="Search members..." class="search-input">
                    <select id="dueFeeGenderFilter" class="search-input" style="width: auto;">
                        <option value="all">All Genders</option>
                        <option value="men">Men Only</option>
                        <option value="women">Women Only</option>
                    </select>
                </div>
            </div>
            <div id="dueFeesSummary" style="margin-bottom: 1.5rem;"></div>
            <div id="dueFeesTableContainer"></div>
        </div>
    `;
    document.getElementById('contentBody').innerHTML = html;

    // Setup search
    const searchInput = document.getElementById('dueFeeSearch');
    if (searchInput) {
        searchInput.addEventListener('input', Utils.debounce(function () {
            loadDueFeesTable();
        }, 300));
    }

    // Setup gender filter
    const genderFilter = document.getElementById('dueFeeGenderFilter');
    if (genderFilter) {
        genderFilter.addEventListener('change', function () {
            loadDueFeesTable();
        });
    }

    loadDueFeesTable();
}

function loadDueFeesTable(page = 1) {
    const search = document.getElementById('dueFeeSearch')?.value || '';
    const gender = document.getElementById('dueFeeGenderFilter')?.value || 'all';
    const limit = 50;

    // Cancel previous in-flight request for due fees
    if (activeRequests['dueFees']) {
        activeRequests['dueFees'].abort();
    }
    const abortController = new AbortController();
    activeRequests['dueFees'] = abortController;

    fetch(`api/get-due-fees.php?gender=${gender}&page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`, { signal: abortController.signal })
        .then(async res => {
            if (!res.ok) {
                let errorMessage = 'Failed to load due fees';
                try {
                    const errorData = await res.json();
                    errorMessage = errorData.message || errorMessage;
                } catch (e) {
                    errorMessage = `Error ${res.status}: ${res.statusText || 'Server error'}`;
                }
                throw new Error(errorMessage);
            }

            const contentType = res.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error('Invalid response format from server');
            }

            const text = await res.text();
            if (!text || text.trim() === '') {
                throw new Error('Empty response from server');
            }

            try {
                return JSON.parse(text);
            } catch (e) {
                console.error('Invalid JSON response:', text);
                throw new Error('Invalid JSON response from server');
            }
        })
        .then(data => {
            if (abortController.signal.aborted) return;
            if (data.success) {
                renderDueFeesSummary(data.summary);
                renderDueFeesTable(data.data, data.pagination);
            } else {
                document.getElementById('dueFeesTableContainer').innerHTML =
                    '<div class="error">Failed to load due fees</div>';
            }
        })
        .catch(err => {
            console.error('Due fees error:', err);
            document.getElementById('dueFeesTableContainer').innerHTML =
                `<div class="error">Error loading due fees: ${err.message}</div>`;
        });
}

function renderDueFeesSummary(summary) {
    const html = `
        <div class="dashboard-stats">
            <div class="stat-card">
                <h3>Total Members with Due</h3>
                <p style="font-size: 2rem; font-weight: bold; color: var(--secondary-color);">
                    ${summary.total_members_with_due || 0}
                </p>
            </div>
            <div class="stat-card">
                <h3>Total Due Amount</h3>
                <p style="font-size: 2rem; font-weight: bold; color: #e74c3c;">
                    ${Utils.formatCurrency(summary.total_due_amount || 0)}
                </p>
            </div>
        </div>
    `;
    document.getElementById('dueFeesSummary').innerHTML = html;
}

function renderDueFeesTable(members, pagination) {
    if (!members || members.length === 0) {
        document.getElementById('dueFeesTableContainer').innerHTML =
            '<div class="info" style="padding: 2rem; text-align: center;">No members with due fees found.</div>';
        return;
    }

    const currentPage = pagination ? (parseInt(pagination.page) || 1) : 1;
    const totalPages = pagination ? (parseInt(pagination.total_pages) || 1) : 1;
    const limit = pagination ? (parseInt(pagination.limit) || 50) : 50;
    const startIndex = (currentPage - 1) * limit;

    const html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Gender</th>
                    <th>Phone</th>
                    <th>Due Amount</th>
                    <th>Next Fee Due Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${members.map((m, idx) => `
                    <tr>
                        <td data-label="#">${startIndex + idx + 1}</td>
                        <td data-label="Code">${m.member_code}</td>
                        <td data-label="Name"><strong>${m.name}</strong></td>
                        <td data-label="Gender">${m.gender === 'men' ? '👨 Men' : '👩 Women'}</td>
                        <td data-label="Phone">${m.phone}</td>
                        <td data-label="Due Amount"><strong style="color: #e74c3c;">${Utils.formatCurrency(m.total_due_amount || 0)}</strong></td>
                        <td data-label="Next Fee Due">${m.next_fee_due_date ? Utils.formatDate(m.next_fee_due_date) : 'N/A'}</td>
                        <td data-label="Status"><span class="badge ${m.status === 'active' ? 'badge-success' : 'badge-secondary'}">${m.status}</span></td>
                        <td data-label="Actions">
                            <button class="btn btn-sm btn-primary" onclick="showUpdateDueFeeModal(${m.id}, '${m.gender}', ${m.total_due_amount || 0}, '${m.name}')">
                                Update Due
                            </button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        ${pagination && totalPages > 1 ? `
            <div class="pagination" style="margin-top: 1.5rem; display: flex; justify-content: center; align-items: center; gap: 1rem; flex-wrap: wrap;">
                <button class="btn btn-secondary" ${currentPage <= 1 ? 'disabled' : ''} onclick="loadDueFeesTable(${currentPage - 1})">
                    Previous
                </button>
                <span>Page</span>
                <input type="number" id="dueFeesPageInput" min="1" max="${totalPages}" value="${currentPage}" style="width: 60px; padding: 0.25rem; text-align: center; border: 1px solid #ddd; border-radius: 4px;" onchange="const page = parseInt(this.value) || 1; if (page >= 1 && page <= ${totalPages}) loadDueFeesTable(page); else this.value = ${currentPage};" onkeypress="if(event.key === 'Enter') { const page = parseInt(this.value) || 1; if (page >= 1 && page <= ${totalPages}) loadDueFeesTable(page); else this.value = ${currentPage}; }">
                <span>of ${totalPages}</span>
                <button class="btn btn-secondary" ${currentPage >= totalPages ? 'disabled' : ''} onclick="loadDueFeesTable(${currentPage + 1})">
                    Next
                </button>
            </div>
        ` : ''}
    `;
    document.getElementById('dueFeesTableContainer').innerHTML = html;
}

function showUpdateDueFeeModal(memberId, gender, currentDueAmount, memberName) {
    const html = `
        <div class="modal" id="updateDueFeeModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Update Due Fee - ${memberName}</h2>
                    <button class="modal-close" onclick="closeUpdateDueFeeModal()">&times;</button>
                </div>
                <form id="updateDueFeeForm" class="modal-body">
                    <input type="hidden" id="dueFeeMemberId" value="${memberId}">
                    <input type="hidden" id="dueFeeGender" value="${gender}">
                    
                    <div class="form-group">
                        <label>Current Due Amount:</label>
                        <strong style="font-size: 1.2rem; color: #e74c3c;">${Utils.formatCurrency(currentDueAmount)}</strong>
                    </div>
                    
                    <div class="form-group">
                        <label>Action *</label>
                        <select id="dueFeeAction" name="action" required>
                            <option value="update">Set to Specific Amount</option>
                            <option value="add">Add to Current Amount</option>
                            <option value="clear">Clear All (Set to 0)</option>
                        </select>
                    </div>
                    
                    <div class="form-group" id="dueFeeAmountGroup">
                        <label>Amount *</label>
                        <input type="number" step="0.01" id="dueFeeAmount" name="amount" value="${currentDueAmount}" min="0" required>
                        <small>Enter the amount for the selected action</small>
                    </div>
                    
                    <div class="form-group">
                        <div id="dueFeePreview" style="background: rgba(37, 43, 74, 0.6); color: #ffffff; padding: 1rem; border-radius: 5px; margin-top: 1rem; border: 1px solid var(--border-color);">
                            <strong style="color: #ffffff;">Preview:</strong> <span style="color: #d1d5db;">New due amount will be: <span id="previewAmount" style="color: #ffffff; font-weight: bold;">${Utils.formatCurrency(currentDueAmount)}</span></span>
                        </div>
                    </div>
                    
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="closeUpdateDueFeeModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Update Due Fee</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const form = document.getElementById('updateDueFeeForm');
    const actionSelect = document.getElementById('dueFeeAction');
    const amountInput = document.getElementById('dueFeeAmount');
    const amountGroup = document.getElementById('dueFeeAmountGroup');
    const previewDiv = document.getElementById('previewAmount');

    // Update preview when action or amount changes
    function updatePreview() {
        const action = actionSelect.value;
        const currentAmount = parseFloat(currentDueAmount) || 0;
        const inputAmount = parseFloat(amountInput.value) || 0;
        let newAmount = 0;

        if (action === 'clear') {
            newAmount = 0;
        } else if (action === 'add') {
            newAmount = currentAmount + inputAmount;
        } else {
            newAmount = inputAmount;
        }

        previewDiv.textContent = Utils.formatCurrency(newAmount);
    }

    actionSelect.addEventListener('change', function () {
        if (this.value === 'clear') {
            amountGroup.style.display = 'none';
            amountInput.required = false;
        } else {
            amountGroup.style.display = 'block';
            amountInput.required = true;
            if (this.value === 'add') {
                amountInput.value = 0;
                amountInput.placeholder = 'Amount to add';
            } else {
                amountInput.value = currentDueAmount;
                amountInput.placeholder = 'New due amount';
            }
        }
        updatePreview();
    });

    amountInput.addEventListener('input', updatePreview);

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        saveDueFeeUpdate();
    });
}

function closeUpdateDueFeeModal() {
    const modal = document.getElementById('updateDueFeeModal');
    if (modal) modal.remove();
}

function saveDueFeeUpdate() {
    const memberId = document.getElementById('dueFeeMemberId').value;
    const gender = document.getElementById('dueFeeGender').value;
    const action = document.getElementById('dueFeeAction').value;
    const amount = parseFloat(document.getElementById('dueFeeAmount').value) || 0;

    if (action !== 'clear' && amount < 0) {
        Utils.showNotification('Amount cannot be negative', 'error');
        return;
    }

    const dueFeeData = {
        member_id: memberId,
        gender: gender,
        action: action,
        due_amount: action === 'clear' ? 0 : amount
    };

    fetch('api/update-due-fee.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dueFeeData)
    })
        .then(async res => {
            if (!res.ok) {
                let errorMessage = 'Failed to update due fee';
                try {
                    const errorData = await res.json();
                    errorMessage = errorData.message || errorMessage;
                } catch (e) {
                    errorMessage = `Error ${res.status}: ${res.statusText || 'Server error'}`;
                }
                throw new Error(errorMessage);
            }

            const contentType = res.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error('Invalid response format from server');
            }

            const text = await res.text();
            if (!text || text.trim() === '') {
                throw new Error('Empty response from server');
            }

            try {
                return JSON.parse(text);
            } catch (e) {
                console.error('Invalid JSON response:', text);
                throw new Error('Invalid JSON response from server');
            }
        })
        .then(data => {
            if (data.success) {
                const message = data.message || 'Due fee updated successfully';
                if (data.payment_recorded) {
                    Utils.showNotification(message + ' Payment recorded in member profile.', 'success');
                } else {
                    Utils.showNotification(message, 'success');
                }
                closeUpdateDueFeeModal();

                // Refresh all tables with a small delay to ensure database transaction is complete
                setTimeout(() => {
                    loadDueFeesTable();
                    // Refresh members table to show updated due amounts
                    if (currentSection === 'members') {
                        loadMembersTable();
                    }
                    // Refresh payments table to show updated payment records
                    if (document.getElementById('paymentsTableContainer')) {
                        loadPaymentsTable();
                    }
                    // If on dashboard, refresh it too to update revenue
                    if (document.getElementById('dashboard-stats')) {
                        loadDashboard();
                    }
                }, 500);
            } else {
                Utils.showNotification(data.message || 'Failed to update due fee', 'error');
            }
        })
        .catch(err => {
            console.error('Due fee update error:', err);
            Utils.showNotification(err.message || 'Error updating due fee', 'error');
        });
}

function loadExpenses() {
    // Cancel any existing expenses requests
    if (activeRequests['expensesTable']) {
        activeRequests['expensesTable'].abort();
        delete activeRequests['expensesTable'];
    }
    if (activeRequests['expensesSummary']) {
        activeRequests['expensesSummary'].abort();
        delete activeRequests['expensesSummary'];
    }
    if (activeRequests['expenseCategories']) {
        activeRequests['expenseCategories'].abort();
        delete activeRequests['expenseCategories'];
    }

    const html = `
        <div class="expenses-section">
            <div class="section-header">
                <h2>Expenses Management</h2>
                <div class="section-actions">
                    <div style="display: flex; gap: 0.5rem; align-items: center; margin-right: 0.5rem;">
                        <button class="btn ${expensesViewMode === 'current' ? 'btn-primary' : 'btn-secondary'}" id="expenseViewCurrentBtn">Current Month</button>
                        <button class="btn ${expensesViewMode === 'history' ? 'btn-primary' : 'btn-secondary'}" id="expenseViewHistoryBtn">View History</button>
                    </div>
                    <div id="expenseHistorySelector" style="display: ${expensesViewMode === 'history' ? 'flex' : 'none'}; gap: 0.5rem; align-items: center; margin-right: 0.5rem;">
                        <select id="expenseMonth" class="search-input" style="width: auto;">
                            ${Array.from({ length: 12 }, (_, i) => {
        const month = i + 1;
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        return `<option value="${month}" ${month === expensesSelectedMonth ? 'selected' : ''}>${monthNames[i]}</option>`;
    }).join('')}
                        </select>
                        <select id="expenseYear" class="search-input" style="width: auto;">
                            ${Array.from({ length: 5 }, (_, i) => {
        const year = new Date().getFullYear() - i;
        return `<option value="${year}" ${year === expensesSelectedYear ? 'selected' : ''}>${year}</option>`;
    }).join('')}
                        </select>
                        <button class="btn btn-primary" id="loadExpenseHistoryBtn">Load</button>
                    </div>
                    <input type="text" id="expenseSearch" placeholder="Search expenses..." class="search-input">
                    <select id="expenseCategoryFilter" class="search-input" style="width: auto;">
                        <option value="">All Categories</option>
                    </select>
                    <button class="btn btn-primary" id="addExpenseBtn">Add Expense</button>
                </div>
            </div>
            <div id="expensesSummary" style="margin-bottom: 1.5rem;">
                <div class="loading">Loading summary...</div>
            </div>
            <div id="expensesTableContainer">
                <div class="loading">Loading expenses...</div>
            </div>
        </div>
    `;
    const contentBody = document.getElementById('contentBody');
    if (!contentBody) return;

    contentBody.innerHTML = html;

    const searchInput = document.getElementById('expenseSearch');
    if (searchInput) {
        searchInput.addEventListener('input', Utils.debounce(function () {
            loadExpensesTable();
        }, 300));
    }

    const startDateInput = document.getElementById('expenseStartDate');
    const endDateInput = document.getElementById('expenseEndDate');
    if (startDateInput) startDateInput.addEventListener('change', loadExpensesTable);
    if (endDateInput) endDateInput.addEventListener('change', loadExpensesTable);

    const categoryFilter = document.getElementById('expenseCategoryFilter');
    if (categoryFilter) categoryFilter.addEventListener('change', loadExpensesTable);

    const addBtn = document.getElementById('addExpenseBtn');
    if (addBtn) addBtn.addEventListener('click', showAddExpenseForm);

    // History view controls
    const expenseViewCurrentBtn = document.getElementById('expenseViewCurrentBtn');
    const expenseViewHistoryBtn = document.getElementById('expenseViewHistoryBtn');
    const expenseHistorySelector = document.getElementById('expenseHistorySelector');
    const loadExpenseHistoryBtn = document.getElementById('loadExpenseHistoryBtn');
    const expenseMonth = document.getElementById('expenseMonth');
    const expenseYear = document.getElementById('expenseYear');

    if (expenseViewCurrentBtn) {
        expenseViewCurrentBtn.addEventListener('click', function () {
            expensesViewMode = 'current';
            expenseViewCurrentBtn.classList.remove('btn-secondary');
            expenseViewCurrentBtn.classList.add('btn-primary');
            expenseViewHistoryBtn.classList.remove('btn-primary');
            expenseViewHistoryBtn.classList.add('btn-secondary');
            expenseHistorySelector.style.display = 'none';
            // Clear date filters when switching to current month
            const startDateInput = document.getElementById('expenseStartDate');
            const endDateInput = document.getElementById('expenseEndDate');
            if (startDateInput) startDateInput.value = '';
            if (endDateInput) endDateInput.value = '';
            loadExpensesTable();
            loadExpensesSummary('', '');
        });
    }

    if (expenseViewHistoryBtn) {
        expenseViewHistoryBtn.addEventListener('click', function () {
            expensesViewMode = 'history';
            expenseViewHistoryBtn.classList.remove('btn-secondary');
            expenseViewHistoryBtn.classList.add('btn-primary');
            expenseViewCurrentBtn.classList.remove('btn-primary');
            expenseViewCurrentBtn.classList.add('btn-secondary');
            expenseHistorySelector.style.display = 'flex';
        });
    }

    if (loadExpenseHistoryBtn) {
        loadExpenseHistoryBtn.addEventListener('click', function () {
            expensesSelectedMonth = parseInt(expenseMonth.value);
            expensesSelectedYear = parseInt(expenseYear.value);
            loadExpensesTable();
            // Calculate start and end dates for the selected month
            const startDate = `${expensesSelectedYear}-${String(expensesSelectedMonth).padStart(2, '0')}-01`;
            const lastDay = new Date(expensesSelectedYear, expensesSelectedMonth, 0).getDate();
            const endDate = `${expensesSelectedYear}-${String(expensesSelectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            loadExpensesSummary(startDate, endDate);
        });
    }

    // Load expenses table and categories (non-blocking)
    // Load table first, then summary and categories
    loadExpensesTable();
    // Load summary and categories in parallel (won't block table)
    setTimeout(() => {
        loadExpensesSummary('', '');
        loadExpenseCategories();
    }, 100);

    // Safety fallback: If still loading after 20 seconds, force clear
    setTimeout(() => {
        const tableContainer = document.getElementById('expensesTableContainer');
        const summaryDiv = document.getElementById('expensesSummary');

        if (tableContainer && tableContainer.innerHTML.includes('Loading')) {
            console.warn('Expenses table still loading after 20s, forcing clear');
            tableContainer.innerHTML = '<div class="error">Loading timeout. Please refresh the page.</div>';
        }

        if (summaryDiv && summaryDiv.innerHTML.includes('Loading')) {
            console.warn('Expenses summary still loading after 20s, forcing clear');
            renderExpensesSummary({ total_expenses: 0, categories: [] });
        }
    }, 20000);
}

function loadExpenseCategories() {
    // Cancel any existing category request
    if (activeRequests['expenseCategories']) {
        activeRequests['expenseCategories'].abort();
    }

    // Create new abort controller for this request
    const abortController = new AbortController();
    activeRequests['expenseCategories'] = abortController;

    fetch('api/expenses.php?action=stats', {
        signal: abortController.signal
    })
        .then(async res => {
            if (!res.ok) return null;
            const text = await res.text();
            return text ? JSON.parse(text) : null;
        })
        .then(data => {
            // Check if request was cancelled
            if (abortController.signal.aborted) {
                return;
            }

            delete activeRequests['expenseCategories'];

            if (data && data.success && data.data.categories) {
                const categoryFilter = document.getElementById('expenseCategoryFilter');
                if (categoryFilter) {
                    // Clear existing options except "All Categories"
                    categoryFilter.innerHTML = '<option value="">All Categories</option>';
                    data.data.categories.forEach(cat => {
                        const option = document.createElement('option');
                        option.value = cat;
                        option.textContent = cat;
                        categoryFilter.appendChild(option);
                    });
                }
            }
        })
        .catch(err => {
            delete activeRequests['expenseCategories'];

            // Don't log error if request was aborted
            if (err.name !== 'AbortError') {
                console.error('Error loading categories:', err);
            }
        });
}

function loadExpensesTable(page = 1) {
    // Cancel any existing expenses table request
    if (activeRequests['expensesTable']) {
        activeRequests['expensesTable'].abort();
    }

    // Show loading state
    const container = document.getElementById('expensesTableContainer');
    if (container) {
        container.innerHTML = '<div class="loading">Loading expenses...</div>';
    }

    // Create new abort controller for this request
    const abortController = new AbortController();
    activeRequests['expensesTable'] = abortController;

    // Set timeout to prevent hanging
    const timeoutId = setTimeout(() => {
        if (!abortController.signal.aborted) {
            abortController.abort();
            // Always clear loading state on timeout
            const container = document.getElementById('expensesTableContainer');
            if (container) {
                container.innerHTML = '<div class="error">Request timed out. Please try again or refresh the page.</div>';
            }
            delete activeRequests['expensesTable'];
        }
    }, 10000); // 10 second timeout (reduced from 15)

    const search = document.getElementById('expenseSearch')?.value || '';
    let startDate = document.getElementById('expenseStartDate')?.value || '';
    let endDate = document.getElementById('expenseEndDate')?.value || '';
    const category = document.getElementById('expenseCategoryFilter')?.value || '';
    const limit = 20;

    // If in history mode and no custom dates set, use selected month/year
    if (expensesViewMode === 'history' && !startDate && !endDate) {
        startDate = `${expensesSelectedYear}-${String(expensesSelectedMonth).padStart(2, '0')}-01`;
        const lastDay = new Date(expensesSelectedYear, expensesSelectedMonth, 0).getDate();
        endDate = `${expensesSelectedYear}-${String(expensesSelectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    } else if (expensesViewMode === 'current' && !startDate && !endDate) {
        // For current month, set dates to current month
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
        const lastDay = new Date(currentYear, currentMonth, 0).getDate();
        endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }

    let url = `api/expenses.php?action=list&page=${page}&limit=${limit}`;
    if (startDate) url += `&start_date=${startDate}`;
    if (endDate) url += `&end_date=${endDate}`;
    if (category) url += `&category=${encodeURIComponent(category)}`;
    if (search) url += `&expense_type=${encodeURIComponent(search)}`;

    fetch(url, {
        signal: abortController.signal
    })
        .then(async res => {
            clearTimeout(timeoutId);

            // Check if already aborted
            if (abortController.signal.aborted) {
                return null;
            }

            const text = await res.text();
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
            }
            if (!text || text.trim() === '') {
                throw new Error('Empty response from server');
            }
            try {
                const data = JSON.parse(text);
                return data;
            } catch (e) {
                console.error('JSON parse error:', e, 'Response:', text.substring(0, 200));
                throw new Error('Invalid JSON response: ' + text.substring(0, 100));
            }
        })
        .then(data => {
            // Check if request was cancelled
            if (abortController.signal.aborted) {
                return;
            }

            // Clear timeout if still active
            clearTimeout(timeoutId);
            delete activeRequests['expensesTable'];

            const container = document.getElementById('expensesTableContainer');
            if (!container) return;

            // Always render something, even if API fails
            if (data && data.success) {
                // Load summary in background (non-blocking)
                loadExpensesSummary(startDate, endDate);
                renderExpensesTable(data.data || [], data.pagination || {});
            } else {
                // Show error but also show empty table interface
                container.innerHTML =
                    '<div class="error" style="margin-bottom: 1rem;">Failed to load expenses: ' + (data?.message || 'Unknown error') + '</div>' +
                    '<div class="info" style="padding: 2rem; text-align: center;">No expenses data available. Try refreshing the page.</div>';
                // Still try to load summary
                loadExpensesSummary(startDate, endDate);
            }
        })
        .catch(err => {
            // Always clear timeout and request tracking
            clearTimeout(timeoutId);
            delete activeRequests['expensesTable'];

            // Don't show error if request was aborted (user navigated away)
            if (err.name === 'AbortError') {
                return;
            }

            console.error('Expenses error:', err);
            const container = document.getElementById('expensesTableContainer');
            if (container) {
                // Always clear loading state and show error
                container.innerHTML =
                    `<div class="error" style="margin-bottom: 1rem;">Error loading expenses: ${err.message}</div>` +
                    '<div class="info" style="padding: 2rem; text-align: center;">Unable to load expenses. Please check your connection and try again.</div>';
            }
            // Still try to load summary (might work even if list fails)
            try {
                loadExpensesSummary(startDate, endDate);
            } catch (e) {
                console.error('Failed to load summary:', e);
            }
        });
}

function loadExpensesSummary(startDate, endDate) {
    // Cancel any existing expenses summary request
    if (activeRequests['expensesSummary']) {
        activeRequests['expensesSummary'].abort();
    }

    // Create new abort controller for this request
    const abortController = new AbortController();
    activeRequests['expensesSummary'] = abortController;

    // Set timeout to prevent hanging
    const timeoutId = setTimeout(() => {
        abortController.abort();
        // Always show summary on timeout (clear loading state)
        const summaryDiv = document.getElementById('expensesSummary');
        if (summaryDiv) {
            renderExpensesSummary({ total_expenses: 0, categories: [] });
        }
    }, 10000); // 10 second timeout for summary

    let url = 'api/expenses.php?action=stats';
    if (startDate) url += `&start_date=${startDate}`;
    if (endDate) url += `&end_date=${endDate}`;

    fetch(url, {
        signal: abortController.signal
    })
        .then(async res => {
            clearTimeout(timeoutId);

            // Check if already aborted
            if (abortController.signal.aborted) {
                return null;
            }

            if (!res.ok) {
                // Show empty summary on error
                renderExpensesSummary({ total_expenses: 0, categories: [] });
                return null;
            }
            const text = await res.text();
            if (!text || text.trim() === '') {
                renderExpensesSummary({ total_expenses: 0, categories: [] });
                return null;
            }
            try {
                return JSON.parse(text);
            } catch (e) {
                console.error('Summary JSON parse error:', e, 'Response:', text.substring(0, 200));
                renderExpensesSummary({ total_expenses: 0, categories: [] });
                return null;
            }
        })
        .then(data => {
            // Check if request was cancelled
            if (abortController.signal.aborted) {
                return;
            }

            // Always clear timeout and request tracking
            clearTimeout(timeoutId);
            delete activeRequests['expensesSummary'];

            if (data && data.success) {
                renderExpensesSummary(data.data);
            } else {
                // Show empty summary if data is invalid
                renderExpensesSummary({ total_expenses: 0, categories: [] });
            }
        })
        .catch(err => {
            // Always clear timeout and request tracking
            clearTimeout(timeoutId);
            delete activeRequests['expensesSummary'];

            // Don't log error if request was aborted (user navigated away)
            if (err.name !== 'AbortError') {
                console.error('Error loading summary:', err);
                // Always show empty summary on error (clears loading state)
                renderExpensesSummary({ total_expenses: 0, categories: [] });
            }
        });
}

function renderExpensesSummary(summary) {
    const summaryDiv = document.getElementById('expensesSummary');
    if (!summaryDiv) return;

    // Ensure summary object exists
    summary = summary || { total_expenses: 0, categories: [] };

    const html = `
        <div class="dashboard-stats">
            <div class="stat-card">
                <h3>Total Expenses</h3>
                <p style="font-size: 2rem; font-weight: bold; color: #e74c3c;">
                    ${Utils.formatCurrency(summary.total_expenses || 0)}
                </p>
            </div>
            <div class="stat-card">
                <h3>Categories</h3>
                <p style="font-size: 1.5rem; font-weight: bold; color: var(--secondary-color);">
                    ${(summary.categories || []).length}
                </p>
            </div>
        </div>
    `;
    summaryDiv.innerHTML = html;
}

function renderExpensesTable(expenses, pagination) {
    const container = document.getElementById('expensesTableContainer');
    if (!container) return;

    // Show month/year info if in history mode
    let monthInfo = '';
    if (expensesViewMode === 'history') {
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        monthInfo = `
            <div style="margin-bottom: 1rem;">
                <h3>Expenses for ${monthNames[expensesSelectedMonth - 1]} ${expensesSelectedYear}</h3>
                <p>Total Expenses: ${expenses ? expenses.length : 0}</p>
            </div>
        `;
    }

    if (!expenses || expenses.length === 0) {
        container.innerHTML = monthInfo + '<div class="info" style="padding: 2rem; text-align: center;">No expenses found.</div>';
        return;
    }

    const currentPage = pagination ? (parseInt(pagination.page) || 1) : 1;
    const totalPages = pagination ? (parseInt(pagination.total_pages) || 1) : 1;
    const limit = pagination ? (parseInt(pagination.limit) || 20) : 20;
    const startIndex = (currentPage - 1) * limit;

    const html = monthInfo + `
        <table class="data-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Date</th>
                    <th>Expense Type</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${expenses.map((e, idx) => `
                    <tr>
                        <td data-label="#">${startIndex + idx + 1}</td>
                        <td data-label="Date">${Utils.formatDate(e.expense_date)}</td>
                        <td data-label="Expense Type"><strong>${e.expense_type}</strong></td>
                        <td data-label="Category">${e.category || 'N/A'}</td>
                        <td data-label="Description">${e.description || '-'}</td>
                        <td data-label="Amount"><strong style="color: #e74c3c;">${Utils.formatCurrency(e.amount || 0)}</strong></td>
                        <td data-label="Actions">
                            <button class="btn btn-sm btn-primary" onclick="showEditExpenseForm(${e.id})">Edit</button>
                            <button class="btn btn-sm btn-danger" onclick="deleteExpense(${e.id})">Delete</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        ${pagination && totalPages > 1 ? `
            <div class="pagination" style="margin-top: 1.5rem; display: flex; justify-content: center; align-items: center; gap: 1rem; flex-wrap: wrap;">
                <button class="btn btn-secondary" ${currentPage <= 1 ? 'disabled' : ''} onclick="loadExpensesTable(${currentPage - 1})">
                    Previous
                </button>
                <span>Page</span>
                <input type="number" id="expensesPageInput" min="1" max="${totalPages}" value="${currentPage}" style="width: 60px; padding: 0.25rem; text-align: center; border: 1px solid #ddd; border-radius: 4px;" onchange="const page = parseInt(this.value) || 1; if (page >= 1 && page <= ${totalPages}) loadExpensesTable(page); else this.value = ${currentPage};" onkeypress="if(event.key === 'Enter') { const page = parseInt(this.value) || 1; if (page >= 1 && page <= ${totalPages}) loadExpensesTable(page); else this.value = ${currentPage}; }">
                <span>of ${totalPages}</span>
                <button class="btn btn-secondary" ${currentPage >= totalPages ? 'disabled' : ''} onclick="loadExpensesTable(${currentPage + 1})">
                    Next
                </button>
            </div>
        ` : ''}
    `;
    document.getElementById('expensesTableContainer').innerHTML = html;
}

function showAddExpenseForm() {
    showExpenseForm();
}

function showEditExpenseForm(expenseId) {
    fetch(`api/expenses.php?action=get&id=${expenseId}`)
        .then(async res => {
            if (!res.ok) throw new Error('Failed to load expense');
            const text = await res.text();
            return JSON.parse(text);
        })
        .then(data => {
            if (data.success) {
                showExpenseForm(data.data);
            } else {
                Utils.showNotification('Failed to load expense details', 'error');
            }
        })
        .catch(err => {
            console.error('Error loading expense:', err);
            Utils.showNotification('Error loading expense', 'error');
        });
}

function showExpenseForm(expense = null) {
    const isEdit = expense !== null;
    const html = `
        <div class="modal" id="expenseModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>${isEdit ? 'Edit' : 'Add'} Expense</h2>
                    <button class="modal-close" onclick="closeExpenseModal()">&times;</button>
                </div>
                <form id="expenseForm" class="modal-body">
                    ${isEdit ? `<input type="hidden" id="expenseId" value="${expense.id}">` : ''}
                    <div class="form-group">
                        <label>Expense Type *</label>
                        <input type="text" id="expenseType" name="expense_type" value="${expense?.expense_type || ''}" required placeholder="e.g., Equipment Maintenance, Rent, Utilities">
                    </div>
                    <div class="form-group">
                        <label>Category</label>
                        <select id="expenseCategory" name="category" style="width: 100%; margin-bottom: 0.5rem;">
                            <option value="">Select existing category (optional)</option>
                        </select>
                        <input type="text" id="expenseCategoryNew" name="category_new" value="${expense?.category || ''}" placeholder="Or type a new category (optional)" style="margin-top: 0.25rem;">
                        <small>You can either select an existing category or type a new one above.</small>
                    </div>
                    <div class="form-group">
                        <label>Amount *</label>
                        <input type="number" step="0.01" id="expenseAmount" name="amount" value="${expense?.amount || ''}" min="0" required>
                    </div>
                    <div class="form-group">
                        <label>Expense Date *</label>
                        <input type="date" id="expenseDate" name="expense_date" value="${expense?.expense_date || new Date().toISOString().split('T')[0]}" required>
                    </div>
                    <div class="form-group">
                        <label>Description</label>
                        <textarea id="expenseDescription" name="description" rows="3" placeholder="Optional description">${expense?.description || ''}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Notes</label>
                        <textarea id="expenseNotes" name="notes" rows="2" placeholder="Additional notes (optional)">${expense?.notes || ''}</textarea>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="closeExpenseModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">${isEdit ? 'Update' : 'Add'} Expense</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);

    // Load categories into dropdown
    loadExpenseCategoriesForForm();

    // Set existing category if editing
    if (expense && expense.category) {
        const categorySelect = document.getElementById('expenseCategory');
        const categoryNew = document.getElementById('expenseCategoryNew');
        // Check if category exists in dropdown, if not show new input
        const optionExists = Array.from(categorySelect.options).some(opt => opt.value === expense.category);
        if (optionExists) {
            categorySelect.value = expense.category;
        } else {
            categoryNew.value = expense.category;
            categoryNew.style.display = 'block';
        }
    }

    // No need to hide/show the new category field anymore; both inputs are always available.

    const form = document.getElementById('expenseForm');
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        saveExpense();
    });
}

function loadExpenseCategoriesForForm() {
    fetch('api/expenses.php?action=stats')
        .then(async res => {
            if (!res.ok) return null;
            const text = await res.text();
            return text ? JSON.parse(text) : null;
        })
        .then(data => {
            const categorySelect = document.getElementById('expenseCategory');
            if (categorySelect && data && data.success && data.data.categories) {
                // Add existing categories to dropdown
                data.data.categories.forEach(cat => {
                    const option = document.createElement('option');
                    option.value = cat;
                    option.textContent = cat;
                    categorySelect.appendChild(option);
                });
            }
        })
        .catch(err => {
            console.error('Error loading categories for form:', err);
        });
}

function closeExpenseModal() {
    const modal = document.getElementById('expenseModal');
    if (modal) modal.remove();
}

function saveExpense() {
    const expenseId = document.getElementById('expenseId')?.value;
    const isEdit = !!expenseId;
    const categorySelect = document.getElementById('expenseCategory');
    const categoryNew = document.getElementById('expenseCategoryNew');

    // Get category: prefer newly typed category if provided, otherwise use dropdown
    let category = '';
    if (categoryNew && categoryNew.value.trim() !== '') {
        category = categoryNew.value.trim();
    } else if (categorySelect) {
        category = categorySelect.value || '';
    }

    const expenseData = {
        expense_type: document.getElementById('expenseType').value,
        category: category || null,
        amount: parseFloat(document.getElementById('expenseAmount').value),
        expense_date: document.getElementById('expenseDate').value,
        description: document.getElementById('expenseDescription').value || null,
        notes: document.getElementById('expenseNotes').value || null
    };
    if (isEdit) expenseData.id = expenseId;

    fetch(`api/expenses.php?action=${isEdit ? 'update' : 'create'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expenseData)
    })
        .then(async res => {
            if (!res.ok) throw new Error('Failed to save expense');
            const text = await res.text();
            return JSON.parse(text);
        })
        .then(data => {
            if (data.success) {
                Utils.showNotification(data.message || (isEdit ? 'Expense updated' : 'Expense added'), 'success');
                closeExpenseModal();
                loadExpensesTable();
                if (currentSection === 'dashboard') loadDashboard();
            } else {
                Utils.showNotification(data.message || 'Failed to save expense', 'error');
            }
        })
        .catch(err => {
            console.error('Expense save error:', err);
            Utils.showNotification(err.message || 'Error saving expense', 'error');
        });
}

function deleteExpense(expenseId) {
    if (!confirm('Are you sure you want to delete this expense? This action cannot be undone.')) return;

    fetch(`api/expenses.php?action=delete&id=${expenseId}`, { method: 'POST' })
        .then(async res => {
            if (!res.ok) throw new Error('Failed to delete expense');
            const text = await res.text();
            return JSON.parse(text);
        })
        .then(data => {
            if (data && data.success) {
                Utils.showNotification('Expense deleted successfully', 'success');
                loadExpensesTable();
                if (currentSection === 'dashboard') loadDashboard();
            } else {
                Utils.showNotification(data?.message || 'Failed to delete expense', 'error');
            }
        })
        .catch(err => {
            console.error('Expense delete error:', err);
            Utils.showNotification(err.message || 'Error deleting expense', 'error');
        });
}

function loadReports() {
    const html = `
        <div class="reports-section">
            <h2>Reports</h2>
            <div class="reports-grid">
                <div class="report-card" onclick="generateReport('members')">
                    <h3>📊 Member Report</h3>
                    <p>View detailed member statistics</p>
                </div>
                <div class="report-card" onclick="generateReport('attendance')">
                    <h3>✓ Attendance Report</h3>
                    <p>View attendance statistics</p>
                </div>
                <div class="report-card" onclick="generateReport('payments')">
                    <h3>💰 Payment Report</h3>
                    <p>View payment and revenue statistics</p>
                </div>
                <div class="report-card" onclick="generateReport('defaulters')">
                    <h3>⚠️ Fee Defaulters</h3>
                    <p>View members with overdue payments</p>
                </div>
            </div>
            <div id="reportResults" style="margin-top: 2rem;"></div>
        </div>
    `;
    document.getElementById('contentBody').innerHTML = html;
}

function generateReport(type) {
    const resultsDiv = document.getElementById('reportResults');
    resultsDiv.innerHTML = '<div class="loading">Generating report...</div>';

    fetch(`api/reports.php?action=${type}`)
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                renderReport(data.data, type);
            } else {
                resultsDiv.innerHTML = `<div class="error">${data.message || 'Failed to generate report'}</div>`;
            }
        })
        .catch(err => {
            console.error('Report error:', err);
            resultsDiv.innerHTML = '<div class="error">Error generating report</div>';
        });
}

function renderReport(data, type) {
    const resultsDiv = document.getElementById('reportResults');

    switch (type) {
        case 'members':
            resultsDiv.innerHTML = `
                <div class="report-content">
                    <h3>Member Statistics</h3>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <strong>Total Men Members:</strong> ${data.men?.total || 0}
                        </div>
                        <div class="stat-item">
                            <strong>Active Men:</strong> ${data.men?.active || 0}
                        </div>
                        <div class="stat-item">
                            <strong>Total Women Members:</strong> ${data.women?.total || 0}
                        </div>
                        <div class="stat-item">
                            <strong>Active Women:</strong> ${data.women?.active || 0}
                        </div>
                        <div class="stat-item">
                            <strong>Total Members:</strong> ${(data.men?.total || 0) + (data.women?.total || 0)}
                        </div>
                        <div class="stat-item">
                            <strong>Total Active:</strong> ${(data.men?.active || 0) + (data.women?.active || 0)}
                        </div>
                    </div>
                </div>
            `;
            break;
        case 'defaulters':
            const defaulters = data.defaulters || [];
            resultsDiv.innerHTML = `
                <div class="report-content">
                    <h3>Fee Defaulters (${defaulters.length})</h3>
                    ${defaulters.length > 0 ? `
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Member Code</th>
                                    <th>Name</th>
                                    <th>Phone</th>
                                    <th>Next Fee Due</th>
                                    <th>Days Overdue</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${defaulters.map((d, idx) => {
                const dueDate = new Date(d.next_fee_due_date);
                const today = new Date();
                const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
                return `
                                        <tr>
                                            <td>${idx + 1}</td>
                                            <td>${d.member_code}</td>
                                            <td>${d.name}</td>
                                            <td>${d.phone}</td>
                                            <td>${Utils.formatDate(d.next_fee_due_date)}</td>
                                            <td><span style="color: red; font-weight: bold;">${daysOverdue} days</span></td>
                                            <td>
                                                <button class="btn btn-sm btn-primary" onclick="updateFee(${d.id}, '${d.member_code}')">Update Fee</button>
                                            </td>
                                        </tr>
                                    `;
            }).join('')}
                            </tbody>
                        </table>
                    ` : '<p>No fee defaulters found. All members are up to date!</p>'}
                </div>
            `;
            break;
        case 'payments':
            resultsDiv.innerHTML = `
                <div class="report-content">
                    <h3>Payment Statistics</h3>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <strong>Total Payments:</strong> ${data.total_payments || 0}
                        </div>
                        <div class="stat-item">
                            <strong>Total Revenue:</strong> ${Utils.formatCurrency(data.total_revenue || 0)}
                        </div>
                        <div class="stat-item">
                            <strong>Average Payment:</strong> ${Utils.formatCurrency(data.avg_payment || 0)}
                        </div>
                    </div>
                </div>
            `;
            break;
        case 'attendance':
            resultsDiv.innerHTML = `
                <div class="report-content">
                    <h3>Attendance Statistics</h3>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <strong>Today's Attendance:</strong> ${data.today || 0}
                        </div>
                        <div class="stat-item">
                            <strong>This Month's Attendance:</strong> ${data.this_month || 0}
                        </div>
                    </div>
                </div>
            `;
            break;
        default:
            resultsDiv.innerHTML = `
                <div class="report-content">
                    <h3>${type.charAt(0).toUpperCase() + type.slice(1)} Report</h3>
                    <pre>${JSON.stringify(data, null, 2)}</pre>
                </div>
            `;
    }
}

function loadImport() {
    const html = `
        <div class="import-section">
            <div class="import-export-container">
                <!-- Import Section -->
                <div class="import-card">
                    <h2>📥 Import Members from Excel</h2>
            <form id="importForm" enctype="multipart/form-data">
                <div class="form-group">
                    <label>Select Gender *</label>
                    <select id="importGender" name="gender" required>
                        <option value="men">Men</option>
                        <option value="women">Women</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Excel File (.xls, .xlsx, .csv) *</label>
                    <input type="file" id="importFile" name="file" accept=".xls,.xlsx,.csv" required>
                </div>
                        <button type="submit" class="btn btn-primary">Import Members</button>
            </form>
            <div id="importResults"></div>
                </div>
                
                <!-- Export/Download Section -->
                <div class="export-card">
                    <h2>📤 Download Data</h2>
                    
                    <!-- Download Members -->
                    <div class="download-section">
                        <h3>Download Members Data</h3>
                        <div class="form-group">
                            <label>Select Gender</label>
                            <select id="exportGender" class="form-control">
                                <option value="all">All (Men + Women)</option>
                                <option value="men">Men Only</option>
                                <option value="women">Women Only</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>File Format</label>
                            <select id="exportFormat" class="form-control">
                                <option value="excel">Excel (.xlsx)</option>
                                <option value="csv">CSV (.csv)</option>
                            </select>
                        </div>
                        <button class="btn btn-success" onclick="downloadMembers()">
                            📥 Download Members
                        </button>
                    </div>
                    
                    <!-- Download Expenses -->
                    <div class="download-section">
                        <h3>Download Expenses Data</h3>
                        <div class="form-row">
                            <div class="form-group">
                                <label>From Date</label>
                                <input type="date" id="expenseStartDate" class="form-control">
                            </div>
                            <div class="form-group">
                                <label>To Date</label>
                                <input type="date" id="expenseEndDate" class="form-control">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>File Format</label>
                            <select id="expenseFormat" class="form-control">
                                <option value="excel">Excel (.xlsx)</option>
                                <option value="csv">CSV (.csv)</option>
                            </select>
                        </div>
                        <button class="btn btn-success" onclick="downloadExpenses()">
                            📥 Download Expenses
                        </button>
                    </div>
                    
                    <!-- Download Payments -->
                    <div class="download-section">
                        <h3>Download Payments Data</h3>
                        <div class="form-group">
                            <label>Select Gender</label>
                            <select id="paymentExportGender" class="form-control">
                                <option value="all">All (Men + Women)</option>
                                <option value="men">Men Only</option>
                                <option value="women">Women Only</option>
                            </select>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>From Date</label>
                                <input type="date" id="paymentStartDate" class="form-control">
                            </div>
                            <div class="form-group">
                                <label>To Date</label>
                                <input type="date" id="paymentEndDate" class="form-control">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>File Format</label>
                            <select id="paymentFormat" class="form-control">
                                <option value="excel">Excel (.xlsx)</option>
                                <option value="csv">CSV (.csv)</option>
                            </select>
                        </div>
                        <button class="btn btn-success" onclick="downloadPayments()">
                            📥 Download Payments
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.getElementById('contentBody').innerHTML = html;

    // Set default dates (current month)
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    document.getElementById('expenseStartDate').value = firstDay.toISOString().split('T')[0];
    document.getElementById('expenseEndDate').value = lastDay.toISOString().split('T')[0];
    document.getElementById('paymentStartDate').value = firstDay.toISOString().split('T')[0];
    document.getElementById('paymentEndDate').value = lastDay.toISOString().split('T')[0];

    const form = document.getElementById('importForm');
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        handleImport();
    });
}

let isImporting = false;

function handleImport() {
    if (isImporting) {
        Utils.showNotification('Import already in progress. Please wait...', 'warning');
        return;
    }

    const form = document.getElementById('importForm');
    const formData = new FormData(form);
    const submitButton = form.querySelector('button[type="submit"]');
    const resultsDiv = document.getElementById('importResults');

    // Disable form and show loading
    isImporting = true;
    submitButton.disabled = true;
    submitButton.textContent = 'Importing... Please wait';
    resultsDiv.innerHTML = '<div class="loading">Processing import... This may take a few minutes for large files.</div>';

    fetch('api/import.php', {
        method: 'POST',
        body: formData
    })
        .then(res => res.json())
        .then(data => {
            isImporting = false;
            submitButton.disabled = false;
            submitButton.textContent = 'Import Members';

            if (data.success) {
                Utils.showNotification(data.message, 'success');
                resultsDiv.innerHTML = `
                <div class="import-results">
                    <h3>Import Results</h3>
                    <p><strong>Successfully imported: ${data.results.success}</strong></p>
                    <p>Failed: ${data.results.failed}</p>
                    ${data.results.errors.length > 0 ? `
                        <div class="errors">
                            <h4>Errors:</h4>
                            <ul>${data.results.errors.map(e => `<li>${e}</li>`).join('')}</ul>
                        </div>
                    ` : ''}
                    ${data.results.duplicates.length > 0 ? `
                        <div class="duplicates">
                            <h4>Duplicates:</h4>
                            <ul>${data.results.duplicates.map(d => `<li>${d}</li>`).join('')}</ul>
                        </div>
                    ` : ''}
                </div>
            `;
            } else {
                Utils.showNotification(data.message, 'error');
                resultsDiv.innerHTML = `<div class="error">${data.message}</div>`;
            }
        })
        .catch(err => {
            isImporting = false;
            submitButton.disabled = false;
            submitButton.textContent = 'Import Members';
            console.error('Import error:', err);
            Utils.showNotification('Error during import: ' + err.message, 'error');
            resultsDiv.innerHTML = `<div class="error">Import failed: ${err.message}</div>`;
        });
}

function downloadMembers() {
    const gender = document.getElementById('exportGender').value;
    const format = document.getElementById('exportFormat').value;

    Utils.showNotification('Preparing download...', 'info');

    window.location.href = `api/download.php?type=members&gender=${gender}&format=${format}`;
}

function downloadExpenses() {
    const startDate = document.getElementById('expenseStartDate').value;
    const endDate = document.getElementById('expenseEndDate').value;
    const format = document.getElementById('expenseFormat').value;

    if (!startDate || !endDate) {
        Utils.showNotification('Please select both start and end dates', 'error');
        return;
    }

    Utils.showNotification('Preparing download...', 'info');

    window.location.href = `api/download.php?type=expenses&start_date=${startDate}&end_date=${endDate}&format=${format}`;
}

function downloadPayments() {
    const gender = document.getElementById('paymentExportGender').value;
    const startDate = document.getElementById('paymentStartDate').value;
    const endDate = document.getElementById('paymentEndDate').value;
    const format = document.getElementById('paymentFormat').value;

    if (!startDate || !endDate) {
        Utils.showNotification('Please select both start and end dates', 'error');
        return;
    }

    Utils.showNotification('Preparing download...', 'info');

    window.location.href = `api/download.php?type=payments&gender=${gender}&start_date=${startDate}&end_date=${endDate}&format=${format}`;
}

function loadSync() {
    // Detect if we're on online server (check if URL contains online domain or not localhost)
    const isOnline = !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1');

    const html = `
        <div class="sync-section">
            <div class="section-header">
                <h2>Data Synchronization</h2>
                <div class="section-actions">
                    ${isOnline ?
            '<button class="btn btn-primary" id="reverseSyncBtn">⬇️ Sync to Local</button>' :
            '<button class="btn btn-primary" id="syncNowBtn">🔄 Sync to Online</button>'
        }
                </div>
            </div>
            <div style="background: rgba(26, 31, 58, 0.6); color: #ffffff; padding: 1.5rem; border-radius: 10px; box-shadow: var(--shadow); margin-bottom: 1.5rem; border: 1px solid var(--border-color);">
                <h3 style="color: #ffffff;">Sync Status</h3>
                <div id="syncStatus" style="margin-top: 1rem; color: #d1d5db;">
                    <p>${isOnline ?
            'Click "Sync to Local" to download online data to your local database.' :
            'Click "Sync to Online" to upload local data to online server.'
        }</p>
                </div>
            </div>
            <div style="background: rgba(26, 31, 58, 0.6); color: #ffffff; padding: 1.5rem; border-radius: 10px; box-shadow: var(--shadow); border: 1px solid var(--border-color);">
                <h3 style="color: #ffffff;">Sync History</h3>
                <div id="syncHistory" style="margin-top: 1rem;">
                    <div class="loading">Loading sync history...</div>
                </div>
            </div>
        </div>
    `;
    document.getElementById('contentBody').innerHTML = html;

    if (isOnline) {
        const reverseSyncBtn = document.getElementById('reverseSyncBtn');
        if (reverseSyncBtn) {
            reverseSyncBtn.addEventListener('click', performReverseSync);
        }
    } else {
        const syncBtn = document.getElementById('syncNowBtn');
        if (syncBtn) {
            syncBtn.addEventListener('click', performSync);
        }
    }

    loadSyncHistory();
}

function performSync() {
    const syncBtn = document.getElementById('syncNowBtn');
    const syncStatus = document.getElementById('syncStatus');

    if (syncBtn) {
        syncBtn.disabled = true;
        syncBtn.textContent = 'Syncing...';
    }

    if (syncStatus) {
        syncStatus.innerHTML = '<div class="loading">Synchronizing data with online server...</div>';
    }

    // First try normal sync
    fetch('api/sync-local.php?type=manual')
        .then(async res => {
            const text = await res.text();
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
            }
            try {
                return JSON.parse(text);
            } catch (e) {
                throw new Error('Invalid JSON response: ' + text.substring(0, 100));
            }
        })
        .then(data => {
            if (syncBtn) {
                syncBtn.disabled = false;
                syncBtn.textContent = '🔄 Sync Now';
            }

            if (data && data.success) {
                // If 0 records synced, suggest force sync
                if ((data.total_synced || 0) === 0 && (data.total_failed || 0) === 0) {
                    const forceSync = confirm('No records were synced. This might mean all records are marked as synced in the sync log, but they may not actually be in the online database.\n\nWould you like to FORCE SYNC ALL records (this will ignore sync history and sync everything)?');
                    if (forceSync) {
                        // Retry with force sync
                        fetch('api/sync-local.php?type=manual&force=1')
                            .then(async res => {
                                const text = await res.text();
                                if (!res.ok) {
                                    throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
                                }
                                try {
                                    return JSON.parse(text);
                                } catch (e) {
                                    throw new Error('Invalid JSON response: ' + text.substring(0, 100));
                                }
                            })
                            .then(forceData => {
                                if (forceData && forceData.success) {
                                    Utils.showNotification('Force sync completed: ' + (forceData.total_synced || 0) + ' records synced', 'success');
                                    if (syncStatus) {
                                        syncStatus.innerHTML = `
                                            <div style="padding: 1rem; background: rgba(40, 167, 69, 0.2); border-radius: 5px; color: #28a745; border: 1px solid #28a745;">
                                                <strong>✅ Force Sync Completed</strong>
                                                <p style="margin: 0.5rem 0 0 0; color: #d1d5db;">Records Synced: <strong style="color: #28a745;">${forceData.total_synced || 0}</strong></p>
                                                <p style="margin: 0.5rem 0 0 0; color: #d1d5db;">Records Failed: <strong style="color: ${forceData.total_failed > 0 ? '#dc3545' : '#28a745'};">${forceData.total_failed || 0}</strong></p>
                                            </div>
                                        `;
                                    }
                                    loadSyncHistory();
                                } else {
                                    Utils.showNotification('Force sync failed: ' + (forceData?.message || 'Unknown error'), 'error');
                                }
                            })
                            .catch(err => {
                                Utils.showNotification('Force sync error: ' + err.message, 'error');
                            });
                        return;
                    }
                }

                Utils.showNotification(data.message || 'Sync completed successfully', 'success');
                if (syncStatus) {
                    syncStatus.innerHTML = `
                        <div style="padding: 1rem; background: rgba(40, 167, 69, 0.2); border-radius: 5px; color: #28a745; border: 1px solid #28a745;">
                            <strong>✅ Sync Completed</strong>
                            <p style="margin: 0.5rem 0 0 0; color: #d1d5db;">Records Synced: <strong style="color: #28a745;">${data.total_synced || 0}</strong></p>
                            <p style="margin: 0.5rem 0 0 0; color: #d1d5db;">Records Failed: <strong style="color: ${data.total_failed > 0 ? '#dc3545' : '#28a745'};">${data.total_failed || 0}</strong></p>
                            ${data.errors && data.errors.length > 0 ? `
                                <div style="margin-top: 0.5rem;">
                                    <strong>Errors:</strong>
                                    <ul style="margin: 0.5rem 0 0 1rem;">
                                        ${data.errors.slice(0, 5).map(e => `<li>${e}</li>`).join('')}
                                        ${data.errors.length > 5 ? `<li>... and ${data.errors.length - 5} more</li>` : ''}
                                    </ul>
                                </div>
                            ` : ''}
                        </div>
                    `;
                }
                loadSyncHistory();
            } else {
                Utils.showNotification(data?.message || 'Sync failed', 'error');
                if (syncStatus) {
                    syncStatus.innerHTML = `
                        <div style="padding: 1rem; background: rgba(220, 53, 69, 0.2); border-radius: 5px; color: #dc3545; border: 1px solid #dc3545;">
                            <strong>❌ Sync Failed</strong>
                            <p style="margin: 0.5rem 0 0 0; color: #d1d5db;">${data?.message || 'Unknown error'}</p>
                        </div>
                    `;
                }
            }
        })
        .catch(err => {
            console.error('Sync error:', err);
            if (syncBtn) {
                syncBtn.disabled = false;
                syncBtn.textContent = '🔄 Sync Now';
            }
            Utils.showNotification('Error during sync: ' + err.message, 'error');
            if (syncStatus) {
                syncStatus.innerHTML = `
                    <div style="padding: 1rem; background: rgba(220, 53, 69, 0.2); border-radius: 5px; color: #dc3545; border: 1px solid #dc3545;">
                        <strong>❌ Sync Error</strong>
                        <p style="margin: 0.5rem 0 0 0; color: #d1d5db;">${err.message}</p>
                    </div>
                `;
            }
        });
}

function performReverseSync() {
    const syncBtn = document.getElementById('reverseSyncBtn');
    const syncStatus = document.getElementById('syncStatus');

    if (syncBtn) {
        syncBtn.disabled = true;
        syncBtn.textContent = 'Syncing...';
    }

    if (syncStatus) {
        syncStatus.innerHTML = '<div class="loading">Downloading data from online to local database...</div>';
    }

    fetch('api/sync-online-to-local.php?type=manual')
        .then(async res => {
            const text = await res.text();
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
            }
            try {
                return JSON.parse(text);
            } catch (e) {
                throw new Error('Invalid JSON response: ' + text.substring(0, 100));
            }
        })
        .then(data => {
            if (syncBtn) {
                syncBtn.disabled = false;
                syncBtn.textContent = '⬇️ Sync to Local';
            }

            if (data && data.success) {
                Utils.showNotification(data.message || 'Reverse sync completed successfully', 'success');
                if (syncStatus) {
                    syncStatus.innerHTML = `
                        <div style="padding: 1rem; background: rgba(40, 167, 69, 0.2); border-radius: 5px; color: #28a745; border: 1px solid #28a745;">
                            <strong>✅ Reverse Sync Completed</strong>
                            <p style="margin: 0.5rem 0 0 0;">Records Synced: ${data.total_synced || 0}</p>
                            <p style="margin: 0.5rem 0 0 0;">Records Failed: ${data.total_failed || 0}</p>
                            ${data.errors && data.errors.length > 0 ? `
                                <div style="margin-top: 0.5rem;">
                                    <strong>Errors:</strong>
                                    <ul style="margin: 0.5rem 0 0 1rem;">
                                        ${data.errors.slice(0, 5).map(e => `<li>${e}</li>`).join('')}
                                        ${data.errors.length > 5 ? `<li>... and ${data.errors.length - 5} more</li>` : ''}
                                    </ul>
                                </div>
                            ` : ''}
                        </div>
                    `;
                }
                loadSyncHistory();
            } else {
                Utils.showNotification(data?.message || 'Reverse sync failed', 'error');
                if (syncStatus) {
                    let errorHtml = `
                        <div style="padding: 1rem; background: rgba(220, 53, 69, 0.2); border-radius: 5px; color: #dc3545; border: 1px solid #dc3545;">
                            <strong>❌ Reverse Sync Failed</strong>
                            <p style="margin: 0.5rem 0 0 0;"><strong>${data?.message || 'Unknown error'}</strong></p>
                    `;

                    if (data?.note) {
                        errorHtml += `<p style="margin: 0.5rem 0 0 0;">${data.note}</p>`;
                    }

                    if (data?.solutions && Array.isArray(data.solutions)) {
                        errorHtml += `
                            <div style="margin-top: 1rem;">
                                <strong>Possible Solutions:</strong>
                                <ul style="margin: 0.5rem 0 0 1.5rem; padding-left: 0;">
                                    ${data.solutions.map(s => `<li style="margin: 0.25rem 0;">${s}</li>`).join('')}
                                </ul>
                            </div>
                        `;
                    }

                    if (data?.error) {
                        errorHtml += `<p style="margin: 0.5rem 0 0 0; font-size: 0.9em; opacity: 0.8;">Technical Error: ${data.error}</p>`;
                    }

                    errorHtml += `</div>`;
                    syncStatus.innerHTML = errorHtml;
                }
            }
        })
        .catch(err => {
            console.error('Reverse sync error:', err);
            if (syncBtn) {
                syncBtn.disabled = false;
                syncBtn.textContent = '⬇️ Sync to Local';
            }
            Utils.showNotification('Error during reverse sync: ' + err.message, 'error');
            if (syncStatus) {
                syncStatus.innerHTML = `
                    <div style="padding: 1rem; background: rgba(220, 53, 69, 0.2); border-radius: 5px; color: #dc3545; border: 1px solid #dc3545;">
                        <strong>❌ Reverse Sync Error</strong>
                        <p style="margin: 0.5rem 0 0 0;">${err.message}</p>
                    </div>
                `;
            }
        });
}

function loadSyncHistory() {
    // This would fetch sync history from a sync history API endpoint
    // For now, just show a message
    const syncHistory = document.getElementById('syncHistory');
    if (syncHistory) {
        syncHistory.innerHTML = '<p>Sync history will be displayed here after sync operations.</p>';
    }
}

// Auto-sync timer (every 30 minutes)
let autoSyncInterval = null;

function startAutoSync() {
    // Clear existing interval if any
    if (autoSyncInterval) {
        clearInterval(autoSyncInterval);
    }

    // Auto-sync every 30 minutes (1800000 ms)
    autoSyncInterval = setInterval(() => {
        // Auto-sync triggered
        fetch('api/sync-local.php?type=auto')
            .then(async res => {
                const text = await res.text();
                if (res.ok) {
                    const data = JSON.parse(text);
                    if (data.success) {
                        // Auto-sync completed successfully
                        // Only show notification if on sync page
                        if (currentSection === 'sync') {
                            Utils.showNotification('Auto-sync completed: ' + (data.total_synced || 0) + ' records synced', 'success');
                            loadSyncHistory();
                        }
                    }
                }
            })
            .catch(err => {
                console.error('Auto-sync error:', err);
            });
    }, 1800000); // 30 minutes
}


function handleLogout() {
    // Stop auto-sync on logout
    if (autoSyncInterval) {
        clearInterval(autoSyncInterval);
    }

    fetch('api/auth.php?action=logout', {
        method: 'POST'
    })
        .then(() => {
            window.location.href = 'index.html';
        })
        .catch(() => {
            window.location.href = 'index.html';
        });
}


// ==========================================
// GLOBAL SCAN SEARCH
// ==========================================
let isGlobalScanning = false;
let globalScanInterval = null;

function toggleGlobalSearchScan() {
    if (isGlobalScanning) {
        stopGlobalSearchScan();
        return;
    }

    // Create and show overlay
    const overlayHtml = `
        <div id="scanSearchOverlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 9999; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white;">
            <div style="font-size: 4rem; color: #2196F3; margin-bottom: 20px;">
                <i class="fas fa-wifi fa-pulse"></i>
            </div>
            <h2 style="margin-bottom: 10px;">Waiting for Admin Scanner...</h2>
            <p style="font-size: 1.2rem; color: #ccc;">Flash a card on the admin desk scanner to view profile.</p>
            <button class="btn btn-secondary" onclick="stopGlobalSearchScan()" style="margin-top: 30px; padding: 10px 30px; font-size: 1.1rem;">Cancel</button>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', overlayHtml);
    isGlobalScanning = true;

    // Start polling
    let attempts = 0;
    const maxAttempts = 60; // 1 minute timeout

    globalScanInterval = setInterval(() => {
        attempts++;
        if (attempts >= maxAttempts) {
            stopGlobalSearchScan();
            Utils.showNotification('Scan timed out', 'info');
            return;
        }

        fetch('api/rfid-assign.php?action=get_latest')
            .then(res => res.json())
            .then(data => {
                if (data.success && data.found && data.uid) {
                    const now = Math.floor(Date.now() / 1000);
                    // Only accept very recent scans (last 3 seconds) to avoid picking up old cached ones immediately
                    if (now - data.timestamp < 3) {
                        handleGlobalScanSuccess(data.uid);
                    }
                }
            })
            .catch(err => console.error('Global scan poll error:', err));
    }, 1000);
}

function stopGlobalSearchScan() {
    isGlobalScanning = false;
    clearInterval(globalScanInterval);
    const overlay = document.getElementById('scanSearchOverlay');
    if (overlay) overlay.remove();
}

function handleGlobalScanSuccess(uid) {
    stopGlobalSearchScan();
    Utils.showNotification('Card detected! Searching...', 'info');

    // Try finding in 'men' first
    fetch(`api/members.php?action=getByRfid&rfid_uid=${uid}&gender=men`)
        .then(res => res.json())
        .then(data => {
            if (data.success && data.data) {
                openMemberProfile(data.data.member_code, 'men');
            } else {
                // Not found in men, try women
                return fetch(`api/members.php?action=getByRfid&rfid_uid=${uid}&gender=women`)
                    .then(res => res.json())
                    .then(data => {
                        if (data.success && data.data) {
                            openMemberProfile(data.data.member_code, 'women');
                        } else {
                            Utils.showNotification('Member not found with this RFID card', 'error');
                        }
                    });
            }
        })
        .catch(err => {
            console.error('Search error:', err);
            Utils.showNotification('Error searching for member', 'error');
        });
}

// ==========================================
// CAMERA CAPTURE
// ==========================================
let cameraStream = null;

function startCamera() {
    // Check if browser supports media devices
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        Utils.showNotification('Camera Access not supported by this browser.', 'error');
        return;
    }

    // Create modal logic
    const html = `
        <div class="modal" id="cameraModal" style="display: flex;">
            <div class="modal-content" style="max-width: 640px; width: 100%;">
                <div class="modal-header">
                    <h2>Capture Photo</h2>
                    <button class="modal-close" onclick="stopCamera()">&times;</button>
                </div>
                <div class="modal-body" style="text-align: center;">
                    <video id="cameraVideo" autoplay playsinline style="width: 100%; max-height: 400px; background: #000; border-radius: 8px;"></video>
                    <canvas id="cameraCanvas" style="display: none;"></canvas>
                </div>
                <div class="modal-footer" style="justify-content: center;">
                    <button type="button" class="btn btn-primary" onclick="capturePhoto()" style="font-size: 1.2rem; padding: 10px 30px;">
                        <i class="fas fa-camera"></i> Take Photo
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="stopCamera()">Cancel</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);

    // Start stream
    const video = document.getElementById('cameraVideo');
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            cameraStream = stream;
            video.srcObject = stream;
        })
        .catch(err => {
            console.error('Camera Error:', err);
            Utils.showNotification('Could not access camera: ' + err.message, 'error');
            stopCamera(); // Cleanup modal if error
        });
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    const modal = document.getElementById('cameraModal');
    if (modal) modal.remove();
}

function capturePhoto() {
    const video = document.getElementById('cameraVideo');
    const canvas = document.getElementById('cameraCanvas');

    if (!video || !canvas) return;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw frame
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to file
    canvas.toBlob(blob => {
        const file = new File([blob], "profile_capture.jpg", { type: "image/jpeg" });

        // Update file input
        const fileInput = document.getElementById('profileImage');
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;

        // Trigger change event for preview
        const event = new Event('change', { bubbles: true });
        fileInput.dispatchEvent(event);

        stopCamera();
        Utils.showNotification('Photo captured!', 'success');
    }, 'image/jpeg', 0.99); // 99% quality
}

