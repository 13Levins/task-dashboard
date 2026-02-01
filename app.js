// Task Dashboard - GitHub Issues Backend
// Sam & Milo's Shared Workspace

class TaskDashboard {
    constructor() {
        this.repo = '13Levins/task-dashboard';
        this.token = localStorage.getItem('github_token');
        this.issues = [];
        this.currentTaskId = null;
        this.draggedTask = null;
        
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
            'milo': 'Milo 🦊'
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
    openModal(taskId = null, status = 'todo') {
        const modal = document.getElementById('taskModal');
        const form = document.getElementById('taskForm');
        const title = document.getElementById('modalTitle');
        const deleteBtn = document.getElementById('deleteTask');
        
        form.reset();
        
        if (taskId) {
            const task = this.getTask(taskId);
            if (!task) return;
            
            this.currentTaskId = taskId;
            title.textContent = 'Edit Task';
            deleteBtn.style.display = 'block';
            
            document.getElementById('taskId').value = task.id;
            document.getElementById('taskTitle').value = task.title;
            document.getElementById('taskDescription').value = task.description;
            document.getElementById('taskAssignee').value = task.assignee;
            document.getElementById('taskDueDate').value = task.dueDate;
            document.getElementById('taskPriority').value = task.priority;
            document.getElementById('taskStatus').value = task.status;
            document.getElementById('taskStatusSelect').value = task.status;
        } else {
            this.currentTaskId = null;
            title.textContent = 'New Task';
            deleteBtn.style.display = 'none';
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

        // Sidebar buttons
        document.querySelectorAll('.sidebar-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                if (action === 'create-task') {
                    this.openModal(null, 'todo');
                }
                
                // Update active state
                document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
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
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new TaskDashboard();
});
