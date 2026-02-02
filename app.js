// Task Dashboard - GitHub Issues Backend
// Sam & Milo's Shared Workspace

class TaskDashboard {
    constructor() {
        this.repo = '13Levins/task-dashboard';
        this.token = localStorage.getItem('github_token');
        this.issues = [];
        this.tips = [];
        this.currentTaskId = null;
        this.currentTipId = null;
        this.draggedTask = null;
        this.currentView = 'dashboard';
        
        this.init();
    }

    async init() {
        // Always set up token form listener first (needed before auth)
        this.setupTokenForm();
        
        if (!this.token) {
            this.showTokenModal();
            return;
        }
        
        // Set up UI event listeners immediately (only once, before API calls)
        this.setupEventListeners();
        this.setupDragAndDrop();
        
        this.showLoading(true);
        try {
            await this.fetchIssues();
            this.renderAllTasks();
            this.updateAllCounts();
            
            // Set initial view to dashboard
            this.switchView('dashboard');
        } catch (error) {
            console.error('Init error:', error);
            if (error.message.includes('401') || error.message.includes('403')) {
                localStorage.removeItem('github_token');
                this.showTokenModal('Invalid or expired token. Please enter a new one.');
            } else {
                this.showError('Failed to load tasks: ' + error.message);
            }
        }
        this.showLoading(false);
    }

    // GitHub API
    async apiRequest(endpoint, options = {}) {
        const url = endpoint.startsWith('http') 
            ? endpoint 
            : `https://api.github.com/repos/${this.repo}${endpoint}`;
        
        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `token ${this.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }

        if (response.status === 204) return null;
        return response.json();
    }

    async fetchIssues() {
        // Fetch open and closed issues with our labels
        const [open, closed] = await Promise.all([
            this.apiRequest('/issues?state=open&per_page=100'),
            this.apiRequest('/issues?state=closed&labels=done&per_page=100')
        ]);
        
        this.issues = [...open, ...closed]
            .filter(issue => !issue.pull_request) // Exclude PRs
            .map(issue => this.issueToTask(issue));
    }

    issueToTask(issue) {
        const labels = issue.labels.map(l => l.name);
        
        // Determine status from labels
        let status = 'todo';
        if (labels.includes('done') || issue.state === 'closed') {
            status = 'done';
        } else if (labels.includes('in-progress')) {
            status = 'in-progress';
        } else if (labels.includes('todo')) {
            status = 'todo';
        }

        // Determine assignee from labels
        let assignee = '';
        if (labels.includes('assigned:sam')) assignee = 'sam';
        else if (labels.includes('assigned:milo')) assignee = 'milo';

        // Determine priority from labels
        let priority = 'medium';
        if (labels.includes('priority:high')) priority = 'high';
        else if (labels.includes('priority:low')) priority = 'low';
        else if (labels.includes('priority:medium')) priority = 'medium';

        // Extract due date from body if present
        const dueDateMatch = issue.body?.match(/📅 Due: (\d{4}-\d{2}-\d{2})/);
        const dueDate = dueDateMatch ? dueDateMatch[1] : '';

        // Get description (body without metadata)
        let description = issue.body || '';
        description = description.replace(/\n?📅 Due: \d{4}-\d{2}-\d{2}/, '').trim();

        return {
            id: issue.number.toString(),
            issueNumber: issue.number,
            title: issue.title,
            description,
            assignee,
            dueDate,
            priority,
            status,
            createdAt: issue.created_at,
            url: issue.html_url
        };
    }

    taskToIssueBody(task) {
        let body = task.description || '';
        if (task.dueDate) {
            body += `\n\n📅 Due: ${task.dueDate}`;
        }
        return body;
    }

    getLabelsForTask(task) {
        const labels = [];
        
        // Status label
        if (task.status) labels.push(task.status);
        
        // Assignee label
        if (task.assignee) labels.push(`assigned:${task.assignee}`);
        
        // Priority label
        if (task.priority) labels.push(`priority:${task.priority}`);
        
        return labels;
    }

    // Task CRUD
    async createTask(taskData) {
        const labels = this.getLabelsForTask(taskData);
        const body = this.taskToIssueBody(taskData);

        const issue = await this.apiRequest('/issues', {
            method: 'POST',
            body: JSON.stringify({
                title: taskData.title,
                body,
                labels
            })
        });

        const task = this.issueToTask(issue);
        this.issues.push(task);
        this.renderTask(task);
        this.updateColumnCount(task.status);
        return task;
    }

    async updateTask(id, updates) {
        const index = this.issues.findIndex(t => t.id === id);
        if (index === -1) return null;

        const oldTask = this.issues[index];
        const newTask = { ...oldTask, ...updates };
        
        const labels = this.getLabelsForTask(newTask);
        const body = this.taskToIssueBody(newTask);

        // If moving to done, close the issue
        const state = newTask.status === 'done' ? 'closed' : 'open';

        await this.apiRequest(`/issues/${oldTask.issueNumber}`, {
            method: 'PATCH',
            body: JSON.stringify({
                title: newTask.title,
                body,
                labels,
                state
            })
        });

        this.issues[index] = newTask;

        // Re-render if status changed
        if (updates.status && updates.status !== oldTask.status) {
            this.removeTaskElement(id);
            this.renderTask(newTask);
            this.updateColumnCount(oldTask.status);
            this.updateColumnCount(updates.status);
        } else {
            this.updateTaskElement(newTask);
        }

        return newTask;
    }

    async deleteTask(id) {
        const task = this.issues.find(t => t.id === id);
        if (!task) return;

        // Close the issue with a "deleted" label (GitHub doesn't allow deleting issues via API)
        await this.apiRequest(`/issues/${task.issueNumber}`, {
            method: 'PATCH',
            body: JSON.stringify({
                state: 'closed',
                labels: ['deleted']
            })
        });

        const status = task.status;
        this.issues = this.issues.filter(t => t.id !== id);
        this.removeTaskElement(id);
        this.updateColumnCount(status);
    }

    getTask(id) {
        return this.issues.find(t => t.id === id);
    }

    // Rendering
    renderAllTasks() {
        document.querySelectorAll('.tasks').forEach(container => {
            container.innerHTML = '';
        });
        
        this.issues.forEach(task => this.renderTask(task));
    }

    renderTask(task) {
        const container = document.querySelector(`.tasks[data-status="${task.status}"]`);
        if (!container) return;
        
        const card = document.createElement('div');
        card.className = `task-card priority-${task.priority}`;
        card.draggable = true;
        card.dataset.taskId = task.id;
        
        card.innerHTML = this.getTaskHTML(task);
        container.appendChild(card);
    }

    getTaskHTML(task) {
        const dueDateHTML = task.dueDate ? this.getDueDateHTML(task.dueDate) : '';
        const assigneeHTML = task.assignee ? this.getAssigneeHTML(task.assignee) : '';
        const descriptionHTML = task.description ? `<p>${this.escapeHTML(task.description)}</p>` : '';
        
        return `
            <h4>${this.escapeHTML(task.title)}</h4>
            ${descriptionHTML}
            <div class="task-meta">
                ${assigneeHTML}
                ${dueDateHTML}
                <a href="${task.url}" target="_blank" class="issue-link" title="View on GitHub">#${task.issueNumber}</a>
            </div>
        `;
    }

    getAssigneeHTML(assignee) {
        const names = {
            'sam': 'Sam',
            'milo': 'Milo 😏'
        };
        return `<span class="assignee-badge ${assignee}">${names[assignee] || assignee}</span>`;
    }

    getDueDateHTML(dueDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const due = new Date(dueDate + 'T00:00:00');
        const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
        
        let className = '';
        if (diffDays < 0) className = 'overdue';
        else if (diffDays <= 2) className = 'soon';
        
        const formatted = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `<span class="due-date ${className}">📅 ${formatted}</span>`;
    }

    updateTaskElement(task) {
        const card = document.querySelector(`.task-card[data-task-id="${task.id}"]`);
        if (card) {
            card.className = `task-card priority-${task.priority}`;
            card.innerHTML = this.getTaskHTML(task);
        }
    }

    removeTaskElement(id) {
        const card = document.querySelector(`.task-card[data-task-id="${id}"]`);
        if (card) card.remove();
    }

    updateColumnCount(status) {
        const count = this.issues.filter(t => t.status === status).length;
        const column = document.querySelector(`.column[data-status="${status}"]`);
        if (column) {
            column.querySelector('.task-count').textContent = count;
        }
    }

    updateAllCounts() {
        ['todo', 'in-progress', 'done'].forEach(status => this.updateColumnCount(status));
    }

    // Token Modal
    setupTokenForm() {
        // Only set up once
        if (this._tokenFormInitialized) return;
        this._tokenFormInitialized = true;

        document.getElementById('tokenForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const tokenInput = document.getElementById('githubToken');
            const token = tokenInput.value.trim();
            
            if (!token) return;
            
            localStorage.setItem('github_token', token);
            this.token = token;
            this.hideTokenModal();
            await this.init();
        });

        // Allow Escape to close token modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideTokenModal();
            }
        });

        // Close button for token modal
        document.getElementById('closeTokenModal')?.addEventListener('click', () => {
            this.hideTokenModal();
        });

        // Click outside to close token modal
        document.getElementById('tokenModal').addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                this.hideTokenModal();
            }
        });
    }

    showTokenModal(message = '') {
        const modal = document.getElementById('tokenModal');
        const errorEl = document.getElementById('tokenError');
        if (message) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        } else {
            errorEl.style.display = 'none';
        }
        modal.classList.add('active');
    }

    hideTokenModal() {
        document.getElementById('tokenModal').classList.remove('active');
    }

    // Task Modal
    async openModal(taskId = null, status = 'todo') {
        const modal = document.getElementById('taskModal');
        const form = document.getElementById('taskForm');
        const title = document.getElementById('modalTitle');
        const deleteBtn = document.getElementById('deleteTask');
        const taskDetails = document.getElementById('taskDetails');
        
        form.reset();
        
        if (taskId) {
            const task = this.getTask(taskId);
            if (!task) return;
            
            this.currentTaskId = taskId;
            title.textContent = 'Edit Task';
            deleteBtn.style.display = 'block';
            taskDetails.style.display = 'block';
            
            document.getElementById('taskId').value = task.id;
            document.getElementById('taskTitle').value = task.title;
            document.getElementById('taskDescription').value = task.description;
            document.getElementById('taskAssignee').value = task.assignee;
            document.getElementById('taskDueDate').value = task.dueDate;
            document.getElementById('taskPriority').value = task.priority;
            document.getElementById('taskStatus').value = task.status;
            document.getElementById('taskStatusSelect').value = task.status;
            
            // Load comments and activity
            await this.loadCommentsAndActivity(task.issueNumber);
        } else {
            this.currentTaskId = null;
            title.textContent = 'New Task';
            deleteBtn.style.display = 'none';
            taskDetails.style.display = 'none';
            document.getElementById('taskStatus').value = status;
            document.getElementById('taskStatusSelect').value = status;
        }
        
        modal.classList.add('active');
        document.getElementById('taskTitle').focus();
    }

    closeModal() {
        document.getElementById('taskModal').classList.remove('active');
        this.currentTaskId = null;
    }

    // Loading & Error States
    showLoading(show) {
        const loader = document.getElementById('loader');
        if (loader) loader.style.display = show ? 'flex' : 'none';
    }

    showError(message) {
        alert(message); // Simple for now, could be improved
    }

    // Event Listeners
    setupEventListeners() {
        // Only set up once
        if (this._eventListenersInitialized) return;
        this._eventListenersInitialized = true;

        // Sidebar buttons - use event delegation on document to catch clicks even if buttons load later
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.sidebar-btn');
            if (btn) {
                const action = btn.dataset.action;
                const view = btn.dataset.view;
                
                if (action === 'create-task') {
                    this.openModal(null, 'todo');
                } else if (view) {
                    this.switchView(view);
                }
                
                // Update active state (only for view buttons)
                if (view) {
                    document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                }
            }
        });

        // Task card clicks (for editing)
        document.addEventListener('click', (e) => {
            const card = e.target.closest('.task-card');
            const isLink = e.target.closest('.issue-link');
            if (card && !this.draggedTask && !isLink) {
                this.openModal(card.dataset.taskId);
            }
        });

        // Modal controls
        document.getElementById('closeModal').addEventListener('click', () => this.closeModal());
        document.getElementById('cancelTask').addEventListener('click', () => this.closeModal());
        
        document.getElementById('taskModal').addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                this.closeModal();
            }
        });

        // Form submission
        document.getElementById('taskForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleFormSubmit();
        });

        // Delete button
        document.getElementById('deleteTask').addEventListener('click', async () => {
            if (this.currentTaskId && confirm('Delete this task? (It will be closed on GitHub)')) {
                this.showLoading(true);
                await this.deleteTask(this.currentTaskId);
                this.showLoading(false);
                this.closeModal();
            }
        });

        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
                this.hideTokenModal();
            }
        });

        // Refresh button
        document.getElementById('refreshBtn')?.addEventListener('click', async () => {
            this.showLoading(true);
            await this.fetchIssues();
            this.renderAllTasks();
            this.updateAllCounts();
            this.showLoading(false);
        });

        // Logout button
        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            if (confirm('Clear saved token?')) {
                localStorage.removeItem('github_token');
                location.reload();
            }
        });

        // Add comment button
        document.getElementById('addComment')?.addEventListener('click', async () => {
            await this.addComment();
        });

        // Enter key in comment textarea (Cmd+Enter to submit)
        document.getElementById('newComment')?.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                await this.addComment();
            }
        });

        // Task Workshop buttons
        document.getElementById('createTipBtn')?.addEventListener('click', () => {
            this.openTipModal();
        });

        document.getElementById('closeTipModal')?.addEventListener('click', () => {
            this.closeTipModal();
        });

        document.getElementById('cancelTip')?.addEventListener('click', () => {
            this.closeTipModal();
        });

        document.getElementById('tipForm')?.addEventListener('submit', async (e) => {
            await this.handleTipFormSubmit(e);
        });

        document.getElementById('deleteTip')?.addEventListener('click', async () => {
            await this.deleteTip();
        });

        document.getElementById('toggleArchived')?.addEventListener('click', () => {
            this.toggleArchivedTips();
        });

        // Close TIP modal on Escape or click outside
        document.getElementById('tipModal')?.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                this.closeTipModal();
            }
        });
    }

    async handleFormSubmit() {
        const taskData = {
            title: document.getElementById('taskTitle').value.trim(),
            description: document.getElementById('taskDescription').value.trim(),
            assignee: document.getElementById('taskAssignee').value,
            dueDate: document.getElementById('taskDueDate').value,
            priority: document.getElementById('taskPriority').value,
            status: document.getElementById('taskStatusSelect').value
        };

        if (!taskData.title) return;

        this.showLoading(true);
        try {
            if (this.currentTaskId) {
                await this.updateTask(this.currentTaskId, taskData);
            } else {
                await this.createTask(taskData);
            }
        } catch (error) {
            this.showError('Failed to save task: ' + error.message);
        }
        this.showLoading(false);
        this.closeModal();
    }

    // Drag and Drop
    setupDragAndDrop() {
        // Only set up once
        if (this._dragDropInitialized) return;
        this._dragDropInitialized = true;

        document.addEventListener('dragstart', (e) => {
            const card = e.target.closest('.task-card');
            if (card) {
                this.draggedTask = card;
                card.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', card.dataset.taskId);
            }
        });

        document.addEventListener('dragend', (e) => {
            const card = e.target.closest('.task-card');
            if (card) {
                card.classList.remove('dragging');
                this.draggedTask = null;
            }
            document.querySelectorAll('.tasks').forEach(zone => {
                zone.classList.remove('drag-over');
            });
        });

        document.querySelectorAll('.tasks').forEach(zone => {
            zone.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                zone.classList.add('drag-over');
            });

            zone.addEventListener('dragleave', (e) => {
                if (!zone.contains(e.relatedTarget)) {
                    zone.classList.remove('drag-over');
                }
            });

            zone.addEventListener('drop', async (e) => {
                e.preventDefault();
                zone.classList.remove('drag-over');
                
                const taskId = e.dataTransfer.getData('text/plain');
                const newStatus = zone.dataset.status;
                
                if (taskId && newStatus) {
                    const task = this.getTask(taskId);
                    if (task && task.status !== newStatus) {
                        this.showLoading(true);
                        await this.updateTask(taskId, { status: newStatus });
                        this.showLoading(false);
                    }
                }
            });
        });
    }

    // Utilities
    escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Comments & Activity
    async loadCommentsAndActivity(issueNumber) {
        try {
            const [comments, events] = await Promise.all([
                this.apiRequest(`/issues/${issueNumber}/comments`),
                this.apiRequest(`/issues/${issueNumber}/events`)
            ]);
            
            this.renderComments(comments);
            this.renderActivity(events);
        } catch (error) {
            console.error('Failed to load comments/activity:', error);
        }
    }

    renderComments(comments) {
        const container = document.getElementById('commentsList');
        if (!comments || comments.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.85rem;">No comments yet.</p>';
            return;
        }
        
        container.innerHTML = comments.map(comment => {
            const author = comment.user.login;
            const time = new Date(comment.created_at).toLocaleString();
            const body = this.escapeHTML(comment.body);
            
            return `
                <div class="comment-item">
                    <div class="comment-header">
                        <span class="comment-author">${author}</span>
                        <span class="comment-time">${time}</span>
                    </div>
                    <div class="comment-body">${body}</div>
                </div>
            `;
        }).join('');
    }

    renderActivity(events) {
        const container = document.getElementById('activityList');
        
        // Filter for relevant events
        const relevantEvents = events.filter(e => 
            ['labeled', 'unlabeled', 'assigned', 'unassigned', 'closed', 'reopened'].includes(e.event)
        );
        
        if (relevantEvents.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.85rem;">No activity yet.</p>';
            return;
        }
        
        container.innerHTML = relevantEvents.map(event => {
            const time = new Date(event.created_at).toLocaleString();
            const actor = event.actor?.login || 'System';
            let icon = '📝';
            let text = '';
            
            switch (event.event) {
                case 'labeled':
                    icon = '🏷️';
                    const labelName = event.label?.name || '';
                    if (labelName.startsWith('assigned:')) {
                        icon = '👤';
                        text = `<strong>${actor}</strong> assigned to <span class="activity-badge">${labelName.replace('assigned:', '')}</span>`;
                    } else if (labelName.includes('progress')) {
                        icon = '🔨';
                        text = `<strong>${actor}</strong> moved to <span class="activity-badge">In Progress</span>`;
                    } else if (labelName === 'done') {
                        icon = '✅';
                        text = `<strong>${actor}</strong> moved to <span class="activity-badge">Done</span>`;
                    } else if (labelName === 'todo') {
                        icon = '📋';
                        text = `<strong>${actor}</strong> moved to <span class="activity-badge">To Do</span>`;
                    } else if (labelName.startsWith('priority:')) {
                        icon = '⚡';
                        text = `<strong>${actor}</strong> set priority to <span class="activity-badge">${labelName.replace('priority:', '')}</span>`;
                    } else {
                        text = `<strong>${actor}</strong> added label <span class="activity-badge">${labelName}</span>`;
                    }
                    break;
                case 'unlabeled':
                    icon = '🏷️';
                    text = `<strong>${actor}</strong> removed label <span class="activity-badge">${event.label?.name || ''}</span>`;
                    break;
                case 'assigned':
                    icon = '👤';
                    text = `<strong>${actor}</strong> assigned <span class="activity-badge">${event.assignee?.login || 'someone'}</span>`;
                    break;
                case 'unassigned':
                    icon = '👤';
                    text = `<strong>${actor}</strong> unassigned <span class="activity-badge">${event.assignee?.login || 'someone'}</span>`;
                    break;
                case 'closed':
                    icon = '🔒';
                    text = `<strong>${actor}</strong> closed this task`;
                    break;
                case 'reopened':
                    icon = '🔓';
                    text = `<strong>${actor}</strong> reopened this task`;
                    break;
                default:
                    text = `<strong>${actor}</strong> ${event.event}`;
            }
            
            return `
                <div class="activity-item">
                    <div class="activity-icon">${icon}</div>
                    <div class="activity-content">
                        <div class="activity-text">${text}</div>
                        <div class="activity-time">${time}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    async addComment() {
        const textarea = document.getElementById('newComment');
        const commentText = textarea.value.trim();
        
        if (!commentText || !this.currentTaskId) return;
        
        const task = this.getTask(this.currentTaskId);
        if (!task) return;
        
        try {
            await this.apiRequest(`/issues/${task.issueNumber}/comments`, {
                method: 'POST',
                body: JSON.stringify({ body: commentText })
            });
            
            textarea.value = '';
            await this.loadCommentsAndActivity(task.issueNumber);
        } catch (error) {
            this.showError('Failed to add comment: ' + error.message);
        }
    }

    // Task Workshop / TIPs
    async fetchTips() {
        const [active, archived] = await Promise.all([
            this.apiRequest('/issues?labels=tip&state=open&per_page=100'),
            this.apiRequest('/issues?labels=tip-archived&state=all&per_page=100')
        ]);
        
        this.tips = {
            active: active.map(tip => this.issueToTip(tip)),
            archived: archived.map(tip => this.issueToTip(tip))
        };
    }

    issueToTip(issue) {
        const body = issue.body || '';
        
        // Extract complexity from body
        const complexityMatch = body.match(/📊 Complexity: (\d+) points?/);
        const complexity = complexityMatch ? complexityMatch[1] : '';
        
        // Extract references (lines starting with http)
        const references = body.split('\n')
            .filter(line => line.trim().match(/^https?:\/\//))
            .map(line => line.trim());
        
        // Remove metadata from description
        let description = body
            .replace(/📊 Complexity: \d+ points?\n?/, '')
            .replace(/^https?:\/\/.+$/gm, '')
            .trim();
        
        return {
            id: issue.number.toString(),
            issueNumber: issue.number,
            title: issue.title,
            description,
            complexity,
            references,
            comments: issue.comments,
            updatedAt: issue.updated_at,
            createdAt: issue.created_at,
            url: issue.html_url
        };
    }

    renderTips() {
        this.renderTipsList('active');
        this.renderTipsList('archived');
    }

    renderTipsList(type) {
        const container = document.getElementById(`${type}TipsList`);
        const tips = this.tips[type] || [];
        
        if (tips.length === 0) {
            container.innerHTML = `
                <div class="tips-empty">
                    <p>No ${type} TIPs yet</p>
                    ${type === 'active' ? '<p style="font-size: 0.9rem;">Click "+ New TIP" to create one!</p>' : ''}
                </div>
            `;
            return;
        }
        
        // Sort: most recent activity first, then newest first
        const sorted = tips.sort((a, b) => {
            const dateA = new Date(a.updatedAt);
            const dateB = new Date(b.updatedAt);
            if (dateA > dateB) return -1;
            if (dateA < dateB) return 1;
            // If same updated time, sort by created (newest first)
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
        
        container.innerHTML = sorted.map(tip => this.getTipHTML(tip, type)).join('');
    }

    getTipHTML(tip, type) {
        const complexityHTML = tip.complexity 
            ? `<span class="tip-complexity">📊 ${tip.complexity} points</span>` 
            : '';
        
        const commentsHTML = tip.comments > 0 
            ? `<span>💬 ${tip.comments}</span>` 
            : '';
        
        const updated = new Date(tip.updatedAt).toLocaleDateString();
        
        const referencesHTML = tip.references.length > 0 
            ? `<div class="tip-references">
                <h5>📎 References</h5>
                ${tip.references.map(ref => `<a href="${ref}" target="_blank">${ref}</a>`).join('')}
               </div>`
            : '';
        
        const actionsHTML = type === 'active'
            ? `<div class="tip-actions">
                <button class="btn btn-small btn-secondary" onclick="dashboard.editTip('${tip.id}')">Edit</button>
                <button class="btn btn-small btn-primary" onclick="dashboard.convertTipToTask('${tip.id}')">Create Task</button>
               </div>`
            : '';
        
        return `
            <div class="tip-thread" data-tip-id="${tip.id}">
                <div class="tip-header" onclick="dashboard.toggleTip('${tip.id}')">
                    <div class="tip-header-left">
                        <div class="tip-title">${this.escapeHTML(tip.title)}</div>
                        <div class="tip-meta">
                            ${complexityHTML}
                            ${commentsHTML}
                            <span>Updated: ${updated}</span>
                        </div>
                    </div>
                    <div class="tip-header-right">
                        <span class="tip-expand-icon">▼</span>
                    </div>
                </div>
                <div class="tip-body">
                    <div class="tip-description">
                        <p>${this.escapeHTML(tip.description) || '<em>No description</em>'}</p>
                    </div>
                    ${referencesHTML}
                    <div class="tip-discussion">
                        <h5>💬 Discussion</h5>
                        <div id="tip-comments-${tip.id}" class="comments-list"></div>
                        <div class="comment-form" style="margin-top: 0.75rem;">
                            <textarea id="tip-comment-${tip.id}" placeholder="Add a comment..." rows="2"></textarea>
                            <button class="btn btn-small btn-primary" onclick="dashboard.addTipComment('${tip.id}')">Comment</button>
                        </div>
                    </div>
                    ${actionsHTML}
                </div>
            </div>
        `;
    }

    toggleTip(tipId) {
        const tipEl = document.querySelector(`.tip-thread[data-tip-id="${tipId}"]`);
        if (!tipEl) return;
        
        const wasExpanded = tipEl.classList.contains('expanded');
        
        if (!wasExpanded) {
            tipEl.classList.add('expanded');
            // Load comments when expanding
            this.loadTipComments(tipId);
        } else {
            tipEl.classList.remove('expanded');
        }
    }

    async loadTipComments(tipId) {
        const tip = [...this.tips.active, ...this.tips.archived].find(t => t.id === tipId);
        if (!tip) return;
        
        try {
            const comments = await this.apiRequest(`/issues/${tip.issueNumber}/comments`);
            this.renderTipComments(tipId, comments);
        } catch (error) {
            console.error('Failed to load TIP comments:', error);
        }
    }

    renderTipComments(tipId, comments) {
        const container = document.getElementById(`tip-comments-${tipId}`);
        if (!container) return;
        
        if (!comments || comments.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.85rem;">No comments yet.</p>';
            return;
        }
        
        container.innerHTML = comments.map(comment => {
            const author = comment.user.login;
            const time = new Date(comment.created_at).toLocaleString();
            const body = this.escapeHTML(comment.body);
            
            return `
                <div class="comment-item">
                    <div class="comment-header">
                        <span class="comment-author">${author}</span>
                        <span class="comment-time">${time}</span>
                    </div>
                    <div class="comment-body">${body}</div>
                </div>
            `;
        }).join('');
    }

    async addTipComment(tipId) {
        const tip = [...this.tips.active, ...this.tips.archived].find(t => t.id === tipId);
        const textarea = document.getElementById(`tip-comment-${tipId}`);
        const commentText = textarea?.value.trim();
        
        if (!commentText || !tip) return;
        
        try {
            await this.apiRequest(`/issues/${tip.issueNumber}/comments`, {
                method: 'POST',
                body: JSON.stringify({ body: commentText })
            });
            
            textarea.value = '';
            await this.loadTipComments(tipId);
            
            // Refresh TIPs to update comment count and sort order
            await this.fetchTips();
            this.renderTips();
            // Re-expand the TIP
            const tipEl = document.querySelector(`.tip-thread[data-tip-id="${tipId}"]`);
            if (tipEl) tipEl.classList.add('expanded');
        } catch (error) {
            this.showError('Failed to add comment: ' + error.message);
        }
    }

    openTipModal(tipId = null) {
        const modal = document.getElementById('tipModal');
        const form = document.getElementById('tipForm');
        const title = document.getElementById('tipModalTitle');
        const deleteBtn = document.getElementById('deleteTip');
        
        form.reset();
        
        if (tipId) {
            const tip = [...this.tips.active, ...this.tips.archived].find(t => t.id === tipId);
            if (!tip) return;
            
            this.currentTipId = tipId;
            title.textContent = 'Edit TIP';
            deleteBtn.style.display = 'block';
            
            document.getElementById('tipId').value = tip.id;
            document.getElementById('tipTitle').value = tip.title;
            document.getElementById('tipDescription').value = tip.description;
            document.getElementById('tipComplexity').value = tip.complexity;
            document.getElementById('tipReferences').value = tip.references.join('\n');
        } else {
            this.currentTipId = null;
            title.textContent = 'New TIP';
            deleteBtn.style.display = 'none';
        }
        
        modal.classList.add('active');
        document.getElementById('tipTitle').focus();
    }

    closeTipModal() {
        document.getElementById('tipModal').classList.remove('active');
        this.currentTipId = null;
    }

    async handleTipFormSubmit(e) {
        e.preventDefault();
        
        const tipData = {
            title: document.getElementById('tipTitle').value.trim(),
            description: document.getElementById('tipDescription').value.trim(),
            complexity: document.getElementById('tipComplexity').value,
            references: document.getElementById('tipReferences').value
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
        };
        
        if (!tipData.title) return;
        
        // Build body text
        let body = tipData.description;
        
        if (tipData.complexity) {
            body = `📊 Complexity: ${tipData.complexity} points\n\n${body}`;
        }
        
        if (tipData.references.length > 0) {
            body += '\n\n' + tipData.references.join('\n');
        }
        
        this.showLoading(true);
        try {
            if (this.currentTipId) {
                // Update existing TIP
                const tip = [...this.tips.active, ...this.tips.archived].find(t => t.id === this.currentTipId);
                if (tip) {
                    await this.apiRequest(`/issues/${tip.issueNumber}`, {
                        method: 'PATCH',
                        body: JSON.stringify({
                            title: tipData.title,
                            body: body
                        })
                    });
                }
            } else {
                // Create new TIP
                await this.apiRequest('/issues', {
                    method: 'POST',
                    body: JSON.stringify({
                        title: tipData.title,
                        body: body,
                        labels: ['tip']
                    })
                });
            }
            
            await this.fetchTips();
            this.renderTips();
            this.closeTipModal();
        } catch (error) {
            this.showError('Failed to save TIP: ' + error.message);
        }
        this.showLoading(false);
    }

    async deleteTip() {
        if (!this.currentTipId || !confirm('Delete this TIP permanently?')) return;
        
        const tip = [...this.tips.active, ...this.tips.archived].find(t => t.id === this.currentTipId);
        if (!tip) return;
        
        this.showLoading(true);
        try {
            await this.apiRequest(`/issues/${tip.issueNumber}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    state: 'closed',
                    labels: ['deleted']
                })
            });
            
            await this.fetchTips();
            this.renderTips();
            this.closeTipModal();
        } catch (error) {
            this.showError('Failed to delete TIP: ' + error.message);
        }
        this.showLoading(false);
    }

    editTip(tipId) {
        this.openTipModal(tipId);
    }

    async convertTipToTask(tipId) {
        const tip = this.tips.active.find(t => t.id === tipId);
        if (!tip) return;
        
        // Pre-populate task form with TIP data
        this.currentView = 'dashboard';
        this.switchView('dashboard');
        
        // Wait a tick for view to switch
        setTimeout(() => {
            this.openModal(null, 'todo');
            
            document.getElementById('taskTitle').value = tip.title;
            
            // Build description with link to TIP
            let description = tip.description;
            description += `\n\n---\n*Converted from TIP: ${tip.url}*`;
            
            document.getElementById('taskDescription').value = description;
            
            // Set complexity as priority hint
            if (tip.complexity) {
                const complexity = parseInt(tip.complexity);
                if (complexity <= 3) {
                    document.getElementById('taskPriority').value = 'low';
                } else if (complexity <= 8) {
                    document.getElementById('taskPriority').value = 'medium';
                } else {
                    document.getElementById('taskPriority').value = 'high';
                }
            }
        }, 100);
        
        // Archive the TIP
        try {
            await this.apiRequest(`/issues/${tip.issueNumber}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    labels: ['tip-archived']
                })
            });
            
            await this.fetchTips();
            this.renderTips();
        } catch (error) {
            console.error('Failed to archive TIP:', error);
        }
    }

    switchView(view) {
        this.currentView = view;
        
        const dashboardView = document.getElementById('dashboardView');
        const workshopView = document.getElementById('workshopView');
        
        if (view === 'dashboard') {
            dashboardView.style.display = 'grid';
            workshopView.style.display = 'none';
        } else if (view === 'workshop') {
            dashboardView.style.display = 'none';
            workshopView.style.display = 'block';
            this.fetchTips().then(() => this.renderTips());
        }
        
        // Update sidebar active state
        document.querySelectorAll('.sidebar-btn[data-view]').forEach(btn => {
            if (btn.dataset.view === view) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    toggleArchivedTips() {
        const section = document.getElementById('archivedTips');
        const btn = document.getElementById('toggleArchived');
        
        if (section.style.display === 'none') {
            section.style.display = 'block';
            btn.textContent = 'Hide Archived TIPs';
        } else {
            section.style.display = 'none';
            btn.textContent = 'Show Archived TIPs';
        }
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new TaskDashboard();
});
