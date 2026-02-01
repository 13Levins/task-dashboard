# 🦊 Task Dashboard

A minimal kanban-style task board for Sam & Milo's shared workspace.

## Features

- **Three columns**: To Do → In Progress → Done
- **Drag and drop** tasks between columns
- **Task details**: Title, description, assignee, due date, priority
- **Assignees**: Sam or Milo 🦊
- **Priority levels**: Low (green), Medium (orange), High (red)
- **Due date warnings**: Overdue (red) and upcoming (orange) indicators
- **Auto-save**: Tasks persist in browser localStorage
- **Dark theme**: Easy on the eyes

## Usage

Just open `index.html` in your browser. No server, no build step, no dependencies.

```bash
open index.html
# or
python -m http.server 8000  # then visit localhost:8000
```

## Data Storage

Tasks are saved to your browser's localStorage. To export/backup your tasks:

1. Open browser DevTools (F12)
2. Go to Console
3. Run: `localStorage.getItem('taskDashboard')`
4. Copy the JSON output

To restore:
```js
localStorage.setItem('taskDashboard', '<your-json-here>');
location.reload();
```

## Tech Stack

- Vanilla HTML/CSS/JavaScript
- Zero dependencies
- Native drag-and-drop API
- CSS Grid layout
- LocalStorage persistence

---

Built for efficiency. No frameworks, no bloat, just works.
