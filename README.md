# Labour Law Compliance with Reduced Intrusion

A complete full-stack web project for labour law compliance operations with privacy-first, reduced-intrusion controls. The project includes employee attendance logging, employer monitoring, a Node.js backend API, JSON persistence, rule-based compliance logic, and tests.

## What It Does

- Lets employees manually log date, start time, end time, overtime hours, and wages paid.
- Lets employers review employee work records, wage issues, overtime issues, and violation reports.
- Flags daily working-hour, overtime, and minimum-wage violations automatically.
- Tracks labour compliance controls across compensation, working time, leave, benefits, safety, worker voice, and third-party oversight.
- Records control assessments and updates risk status.
- Maintains an evidence vault with review dates, access levels, retention notes, and personal data posture.
- Calculates compliance coverage, risk score, open actions, and intrusion index.
- Shows a data minimization matrix for required data, avoided collection, and safeguards.
- Exports a JSON audit pack from the browser.

The included controls are configurable examples. They are not legal advice and should be reviewed against the specific jurisdiction, industry, workforce type, and current law before production use.

## Project Structure

```text
.
|-- data/
|   `-- db.json
|-- public/
|   |-- app.js
|   |-- dashboard.html
|   |-- index.html
|   |-- login.html
|   |-- login.js
|   |-- runtime-config.js
|   |-- site.css
|   `-- styles.css
|-- scripts/
|   `-- build-frontend.js
|-- src/
|   |-- auth.js
|   |-- complianceEngine.js
|   `-- storage.js
|-- tests/
|   `-- complianceEngine.test.js
|-- package.json
|-- server.js
`-- vercel.json
```

## Run Locally

```bash
npm start
```

Open:

```text
http://localhost:3000
```

Routes:

```text
/       Home page
/login  Login page
/app    Authenticated compliance dashboard
```

Demo logins:

```text
Admin:    admin@labourcontrol.local
Employee: employee@slcs.local
Employer: employer@slcs.local
Password: Compliance@2026
```

## Test

```bash
npm test
```

## Deploy On Vercel

Vercel should host the frontend only. Deploy the Node backend separately first, then point the Vercel build at that backend URL.

Vercel settings:

```text
Framework Preset: Other
Build Command: npm run build
Output Directory: dist
Root Directory: ./
```

Vercel environment variable:

```text
SLCS_API_BASE_URL=https://your-backend-host.example.com
```

For the backend, use a Node hosting platform such as Render. Use:

```text
Build Command: npm install
Start Command: npm start
```

Backend environment variables:

```text
SESSION_SECRET=use-a-long-random-secret
COOKIE_SECURE=true
CORS_ORIGIN=https://your-vercel-project.vercel.app
```

The bundled `data/db.json` works for demo login accounts. Local development writes changes to `data/db.json`; hosted deployments may lose JSON writes after restarts or redeploys, so use MongoDB, MySQL, Postgres, or another hosted database for durable production data.

## API

```text
GET    /api/health
GET    /api/session
POST   /api/login
POST   /api/signup
POST   /api/logout
GET    /api/dashboard
GET    /api/labour-dashboard
GET    /api/employees
GET    /api/work-logs
POST   /api/work-logs
GET    /api/controls
GET    /api/evidence
GET    /api/assessments
GET    /api/audit
POST   /api/assessments
POST   /api/evidence
PATCH  /api/evidence/:id
```

## Production Notes

- Replace JSON storage with a database for multi-user deployments.
- Add authentication, role-based authorization, audit immutability, and encryption at rest.
- Configure jurisdiction-specific rules through a governed policy workflow.
- Treat open employer signup as demo-only; production systems should invite and approve employer accounts.
- Keep named worker data behind exception workflows and use aggregate or pseudonymized evidence for routine monitoring.
