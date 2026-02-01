# 🦊 Task Dashboard

A minimal kanban-style task board for Sam & Milo's shared workspace, backed by GitHub Issues.

## Features

- **Three columns**: To Do → In Progress → Done
- **Drag and drop** tasks between columns
- **Task details**: Title, description, assignee, due date, priority
- **Assignees**: Sam or Milo 🦊
- **Priority levels**: Low (green), Medium (orange), High (red)
- **Due date warnings**: Overdue (red) and upcoming (orange) indicators
- **GitHub Issues backend**: Tasks sync with repository issues
- **Dark theme**: Easy on the eyes

## Setup

1. Open `index.html` in your browser
2. Create a [GitHub Personal Access Token](https://github.com/settings/tokens/new) with `repo` scope
3. Paste the token when prompted
4. Done! Your tasks sync with GitHub Issues

## How It Works

- Each task is a GitHub Issue in this repo
- Labels control status, assignee, and priority:
  - Status: `todo`, `in-progress`, `done`
  - Assignee: `assigned:sam`, `assigned:milo`
  - Priority: `priority:low`, `priority:medium`, `priority:high`
- Due dates are stored in the issue body
- Moving a task to "Done" closes the issue
- Deleting a task closes the issue with a "deleted" label

## Tech Stack

- Vanilla HTML/CSS/JavaScript
- Zero dependencies
- GitHub REST API
- Native drag-and-drop API

## Security

Your GitHub token is stored in your browser's localStorage and only sent to GitHub's API. It never touches any other server.

To clear your token, click the 🚪 button in the header.

---

Built for efficiency. No frameworks, no bloat, just works.
