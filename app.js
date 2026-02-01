// Task Dashboard - Sam & Milo's Shared Workspace

class TaskDashboard {
    constructor() {
        this.tasks = this.loadTasks();
        this.currentTaskId = null;
        this.draggedTask = null;
        
        this.init();
    }

    init() {
        this.renderAllTasks();
        this.setupEventListeners();
        this.setupDragAndDrop();
        this.updateAllCounts();
    }

    // Local Storage
    loadTasks() {
        const saved = localStorage.getItem('taskDashboard');
        return saved ? JSON.parse(saved) : [];
    }

    saveTasks() {
        localStorage.setItem('taskDashboard', JSON.stringify(this.tasks));
    }

    // Task CRUD
    createTask(taskData) {
        const task = {
            id: Date.now().toString(),
            title: taskData.title,
            description: taskData.description || '',
            assignee: taskData.assignee || '',
            dueDate: taskData.dueDate || '',
            priority: taskData.priority || 'medium',
            status: taskData.status || 'todo',
            createdAt: new Date().toISOString()
        };
        
        this.tasks.push(task);
        this.saveTasks();
        this.renderTask(task);
        this.updateColumnCount(task.status);
        return task;
    }

    updateTask(id, updates) {
        const index = this.tasks.findIndex(t => t.id === id);
        if (index === -1) return null;
        
        const oldStatus = this.tasks[index].status;
        this.tasks[index] = { ...this.tasks[index], ...updates };
        this.saveTasks();
        
        // Re-render if status changed
        if (updates.status && updates.status !== oldStatus) {
            this.removeTaskElement(id);
            this.renderTask(this.tasks[index]);
            this.updateColumnCount(oldStatus);
            this.updateColumnCount(updates.status);
        } else {
            this.updateTaskElement(this.tasks[index]);
        }
        
        return this.tasks[index];
    }

    deleteTask(id) {
        const task = this.tasks.find(t => t.id === id);
        if (!task) return;
        
        const status = task.status;
        this.tasks = this.tasks.filter(t => t.id !== id);
        this.saveTasks();
        this.removeTaskElement(id);
        this.updateColumnCount(status);
    }

    getTask(id) {
        return this.tasks.find(t => t.id === id);
    }

    // Rendering
    renderAllTasks() {
        document.querySelectorAll('.tasks').forEach(container => {
            container.innerHTML = '';
        });
        
        this.tasks.forEach(task => this.renderTask(task));
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
        const count = this.tasks.filter(t => t.status === status).length;
        const column = document.querySelector(`.column[data-status="${status}"]`);
        if (column) {
            column.querySelector('.task-count').textContent = count;
        }
    }

    updateAllCounts() {
        ['todo', 'in-progress', 'done'].forEach(status => this.updateColumnCount(status));
    }

    // Modal Management
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
        } else {
            this.currentTaskId = null;
            title.textContent = 'New Task';
            deleteBtn.style.display = 'none';
            document.getElementById('taskStatus').value = status;
        }
        
        modal.classList.add('active');
        document.getElementById('taskTitle').focus();
    }

    closeModal() {
        document.getElementById('taskModal').classList.remove('active');
        this.currentTaskId = null;
    }

    // Event Listeners
    setupEventListeners() {
        // Add task buttons
        document.querySelectorAll('.add-task-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.openModal(null, btn.dataset.status);
            });
        });

        // Task card clicks (for editing)
        document.addEventListener('click', (e) => {
            const card = e.target.closest('.task-card');
            if (card && !this.draggedTask) {
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
        document.getElementById('taskForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleFormSubmit();
        });

        // Delete button
        document.getElementById('deleteTask').addEventListener('click', () => {
            if (this.currentTaskId && confirm('Delete this task?')) {
                this.deleteTask(this.currentTaskId);
                this.closeModal();
            }
        });

        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
    }

    handleFormSubmit() {
        const taskData = {
            title: document.getElementById('taskTitle').value.trim(),
            description: document.getElementById('taskDescription').value.trim(),
            assignee: document.getElementById('taskAssignee').value,
            dueDate: document.getElementById('taskDueDate').value,
            priority: document.getElementById('taskPriority').value,
            status: document.getElementById('taskStatus').value
        };

        if (!taskData.title) return;

        if (this.currentTaskId) {
            this.updateTask(this.currentTaskId, taskData);
        } else {
            this.createTask(taskData);
        }

        this.closeModal();
    }

    // Drag and Drop
    setupDragAndDrop() {
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

            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                zone.classList.remove('drag-over');
                
                const taskId = e.dataTransfer.getData('text/plain');
                const newStatus = zone.dataset.status;
                
                if (taskId && newStatus) {
                    this.updateTask(taskId, { status: newStatus });
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
