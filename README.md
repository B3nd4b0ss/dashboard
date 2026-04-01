# Dashboard

Dashboard is a local developer control center for creating, running, editing, and tracking software projects from one UI.

It combines a React frontend, an Express backend, project scaffolding, runtime controls, task tracking, database helpers, Docker views, local monitoring, and Git/GitHub integration into a single desktop-style workspace. The goal is to keep project creation, daily work, and local operations in one place instead of jumping between multiple tools.

## What This Project Does

Dashboard helps you:

- create new projects with frontend and backend templates
- run and stop projects from one control panel
- manage local-only repositories or publish projects to GitHub
- track tickets and open full ticket detail pages
- attach database metadata to projects
- inspect Docker stacks from the same app
- monitor local project health and resource usage
- open projects in the built-in editor flow
- manage project settings, paths, versions, and scaffold details after creation

## Main Functions

### 1. Project Creation

The composer can generate different project types:

- website projects with a frontend and optional backend
- standalone Python CLI projects
- standalone Java console projects
- standalone Java Maven projects

Supported frontend starters:

- Vite + Vanilla JS
- Vite + Vanilla TS
- Vite + React
- Vite + React TS
- Vite + Vue
- Plain HTML + CSS + JS

Supported backend starters:

- Node.js + Express
- Node.js + Fastify
- Node.js + Koa
- PHP built-in server
- Python HTTP server
- Java HTTP server

### 2. Runtime Control

You can start, stop, inspect, and manage local projects from the dashboard:

- start or stop generated services
- view runtime state for frontend and backend services
- see direct local URLs for running projects
- inspect logs from the project detail page
- run project command presets inside the editor workflow

### 3. Git and GitHub Workflow

Every project can be initialized with Git, and GitHub is optional:

- create a local-only git repository
- create a GitHub-connected project during project creation
- choose public or private visibility when publishing to GitHub
- publish a local-only project later from the project settings view
- delete a project locally and optionally remove the remote GitHub repository too

### 4. Task and Ticket Tracking

The tasks area provides lightweight ticket management:

- create and organize tickets by status
- view tickets grouped by workflow columns
- open a full ticket detail page from the board
- connect tickets back to their source project

### 5. Databases and Docker

The dashboard also includes local infrastructure helpers:

- store local database connection metadata
- link databases to projects
- browse Docker stack information
- inspect stack detail views inside the app

### 6. Monitoring and Overview

The dashboard includes local monitoring features for website projects:

- service health and response checks
- CPU and memory snapshots
- failure indicators
- top-level dashboard resource overview

## App Areas

- `/dashboard` - dashboard home
- `/projects` - project overview board
- `/composer` - dedicated project creation flow
- `/projects/:name` - project detail and settings
- `/projects/:name/editor` - editor and command surface
- `/tasks` - ticket board
- `/tasks/:id` - full ticket detail page
- `/databases` - database management
- `/docker` - Docker hub and stack list
- `/docker/:stackId` - Docker stack detail view
- `/settings` - app settings, including GitHub configuration

## Requirements Specs

### Required Software

| Requirement        | Why it is needed                                      | Recommended version                           |
| ------------------ | ----------------------------------------------------- | --------------------------------------------- |
| Node.js            | Runs the dashboard frontend and backend tooling       | Node.js 20+                                   |
| npm                | Installs root, client, and server dependencies        | npm version bundled with your Node.js install |
| Git                | Creates local repositories and supports publish flows | Any current Git release                       |
| Windows PowerShell | Used by the included helper scripts                   | PowerShell 5.1+ or PowerShell 7+              |

### Optional Software

Install these only if you want the matching project types or integrations:

| Optional tool  | Needed for                                         |
| -------------- | -------------------------------------------------- |
| Docker Desktop | Docker page usage and local Docker stack workflows |
| Python 3       | Python HTTP backends and Python CLI projects       |
| Java JDK       | Java HTTP projects and Java console projects       |
| Maven          | Java Maven project generation and builds           |

### Official Download Pages

Use the official installers or download pages below:

| Software           | Official download page                                                                                                                                                                 | Notes                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Node.js + npm      | [nodejs.org/en/download](https://nodejs.org/en/download/)                                                                                                                              | npm is included with the standard Node.js installer                 |
| Git for Windows    | [git-scm.com/install/windows](https://git-scm.com/install/windows)                                                                                                                     | Recommended for local repositories and GitHub publishing            |
| PowerShell 7       | [learn.microsoft.com/powershell/installing-powershell-on-windows](https://learn.microsoft.com/en-us/powershell/scripting/install/installing-powershell-on-windows?view=powershell-7.5) | Optional if Windows PowerShell 5.1 is already enough for your setup |
| Docker Desktop     | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/)                                                                                                  | Needed only for Docker features                                     |
| Python for Windows | [python.org/downloads/windows](https://www.python.org/downloads/windows/)                                                                                                              | Needed only for Python-based project templates                      |
| Java JDK           | [adoptium.net/temurin](https://adoptium.net/temurin)                                                                                                                                   | A practical OpenJDK distribution for Java project templates         |
| Apache Maven       | [maven.apache.org/download.cgi](https://maven.apache.org/download.cgi)                                                                                                                 | Needed only for Maven-based Java projects                           |

### Common Windows Install Locations

These can vary depending on the installer options, but these are common default locations after installation:

- Node.js: `C:\Program Files\nodejs\`
- Git: `C:\Program Files\Git\`
- Docker Desktop: `C:\Program Files\Docker\Docker\`
- PowerShell 7: `C:\Program Files\PowerShell\7\`
- Java JDK: often under `C:\Program Files\Java\` or a vendor folder such as `C:\Program Files\Eclipse Adoptium\`
- Maven: wherever you extract it, commonly something like `C:\Program Files\Apache\maven\`

### Machine Recommendations

These are practical recommendations for a smooth local experience:

- OS: Windows 10 or Windows 11
- RAM: 8 GB minimum, 16 GB recommended
- CPU: modern 4-core processor or better
- Free disk space: at least 2 GB for the dashboard itself, more if you generate many projects

### Default Local Ports

- Dashboard frontend: `5173`
- Dashboard backend API: `4000`

Generated projects may use additional frontend and backend ports that you choose during project creation.

## How To Install the Requirements

This project is primarily set up for Windows because it ships with PowerShell helper scripts.

### 1. Install Node.js and npm

1. Download and install a current Node.js LTS release from [nodejs.org/en/download](https://nodejs.org/en/download/).
2. Open a new terminal.
3. Verify the installation:

```bash
node -v
npm -v
```

If `npm -v` fails, reinstall Node.js using the official installer and make sure npm is included.

### 2. Install Git

1. Download and install Git for Windows from [git-scm.com/install/windows](https://git-scm.com/install/windows).
2. Keep the option that adds Git to your terminal path enabled.
3. Verify the installation:

```bash
git --version
```

### 3. Check PowerShell

PowerShell is included on modern Windows systems. If you want the newer standalone release, download it from [learn.microsoft.com/powershell/installing-powershell-on-windows](https://learn.microsoft.com/en-us/powershell/scripting/install/installing-powershell-on-windows?view=powershell-7.5). Verify your current installation with:

```powershell
$PSVersionTable.PSVersion
```

### 4. Install Optional Toolchains

Only install the tools you plan to use:

- install Docker Desktop from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) if you want Docker stack support
- install Python 3 from [python.org/downloads/windows](https://www.python.org/downloads/windows/) if you want Python projects or Python HTTP backends
- install a Java JDK from [adoptium.net/temurin](https://adoptium.net/temurin) if you want Java project templates
- install Maven from [maven.apache.org/download.cgi](https://maven.apache.org/download.cgi) if you want Maven-based Java projects

Helpful verification commands:

```bash
docker --version
python --version
java -version
mvn -version
```

### 5. Optional GitHub Setup

If you want GitHub publishing:

1. Create a GitHub personal access token.
2. Open the dashboard settings page.
3. Save your GitHub owner and token there.

For private repository creation, the token needs private-repository creation permissions. For local-only workflows, GitHub setup is not required.

## Security And Trust Model

Dashboard is built first as a local, single-user developer workspace. The current safety model assumes you trust the machine it runs on and the people who can reach the local UI.

- manual terminal commands are disabled by default until you explicitly enable Advanced terminal mode in `/settings`
- saved project command presets still work even when manual commands are locked
- recent terminal executions are written to `logs/terminal-history.json` so command activity is easier to review later
- on Windows, GitHub tokens are encrypted with the current user profile before they are written to `settings.json`; the token is never returned in public API responses and is only used for GitHub-related actions
- the app is not intended to be exposed directly to the public internet or untrusted multi-user environments without adding your own authentication and network controls

If you need to access the dashboard from a non-loopback origin during development, set `DASHBOARD_ALLOWED_ORIGINS` to a comma-separated allowlist and `DASHBOARD_HOST` to the interface you want the backend to bind to. The default behavior is local-only.

## Project Installation Tutorial

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd dashboard
```

### 2. Install Dashboard Dependencies

Install dependencies in the root, server, and client workspaces:

```bash
npm install
npm install --prefix server
npm install --prefix client
```

### 3. Start the App in Development Mode

Run the client and server together:

```bash
npm run dev
```

Open:

- frontend UI: [http://localhost:5173](http://localhost:5173)
- backend API: [http://localhost:4000](http://localhost:4000)

### 4. Start the App with the Windows Helper Scripts

If you want background-style startup helpers on Windows:

```bash
npm run app:start
npm run app:status
npm run app:stop
```

### 5. Start the Main Dashboard with PM2

If you prefer PM2 process management:

```bash
npm run pm2:main:start
npm run pm2:main:status
npm run pm2:main:logs
npm run pm2:main:restart
npm run pm2:main:stop
```

PM2 configuration lives in `ecosystem.config.cjs`.

## Typical First Run Workflow

1. Start the dashboard.
2. Open `/settings` and configure GitHub if you want publish support.
3. Open `/composer` and create a project.
4. Choose whether the project should stay local-only or connect to GitHub.
5. Open the new project detail page.
6. Start the project or open it in the editor.
7. Add tasks from the task board and link work back to the project.

## Data, State, and Generated Files

The app stores its working state directly in the repository for easy inspection and backup.

- `data.json` - project metadata
- `databases.json` - database metadata
- `tasks.json` - task and ticket data
- `settings.json` - dashboard settings such as GitHub preferences
- `projects/` - generated local project workspaces
- `docker-stacks/` - Docker stack data
- `logs/` - runtime logs, PM2 logs, and terminal execution history

## Repository Structure

```text
dashboard/
  client/              React + Vite frontend
  server/              Express API and orchestration layer
  scripts/             PowerShell helper scripts
  docs/                Supporting documentation
  projects/            Generated project workspaces
  docker-stacks/       Docker stack data
  logs/                Runtime and PM2 logs
  data.json            Project metadata
  databases.json       Database metadata
  tasks.json           Task metadata
  settings.json        Dashboard settings
  ecosystem.config.cjs PM2 config
```

## Development Notes

- The dashboard is designed first for local developer workflow orchestration, not multi-user cloud deployment.
- Website projects are the main monitored runtime surface.
- Python and Java standalone apps behave more like generated workspaces or runnable projects than continuously monitored web services.
- Windows is the primary target environment because the helper scripts and workflow assumptions are PowerShell-oriented.

## Current Status

This repository is best suited as a local development dashboard for project scaffolding, local runtime control, task tracking, Git/GitHub workflow management, and infrastructure visibility on a developer machine.
