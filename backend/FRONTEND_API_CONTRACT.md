# AI Employee 360 --- Frontend API Contract

**Document:** `FRONTEND_API_CONTRACT.md`\
**Version:** 1.0\
**Status:** Milestone 1 verified backend contract\
**Purpose:** Define the API boundary between the existing AI Employee
360 backend and future frontend consumers, initially the Zoho People Web
Tab.

------------------------------------------------------------------------

## 1. Purpose

This document defines the currently verified HTTP API boundary exposed
by the AI Employee 360 backend.

The frontend is an **API consumer**.

The frontend must not: - access Zoho People directly; - contain Zoho
People OAuth credentials; - contain Catalyst Connection credentials; -
contain `GEMINI_API_KEY`; - reproduce backend Employee 360 business
logic; - bypass backend authorization; - create or infer Employee 360
facts unavailable from the API.

The existing backend is the source of truth for Employee 360 data,
deterministic intelligence, evidence, timeline processing, permissions,
and future AI processing.

------------------------------------------------------------------------

## 2. Architecture Boundary

``` text
Zoho People
    ↓
Connector Layer
    ↓
Canonical Employee 360 Model
    ↓
Deterministic Intelligence
    ↓
Evidence Layer
    ↓
AI Engine
    ↓
Headless API
    ↓
Frontend / Any Experience
```

The frontend begins at the **Headless API** boundary.

The frontend is not part of the Connector Layer, Canonical Model,
Deterministic Intelligence, Evidence Layer, or AI Engine.

------------------------------------------------------------------------

## 3. Current Backend Environment

  ----------------------------------------------------------------------------------------------
  Property                            Verified value
  ----------------------------------- ----------------------------------------------------------
  Catalyst Project                    `Employee360-AI`

  Environment                         Development

  Function                            `employee_360_ai_function`

  Function type                       Advanced I/O

  Runtime                             Node 22

  Deployment                          Not deployed

  Local base URL                      `http://localhost:3000/server/employee_360_ai_function/`
  ----------------------------------------------------------------------------------------------

### Zoho People

  Property       Verified value
  -------------- ---------------------------------
  Organization   VSK HR Solution Private Limited
  Data Centre    India (`in`)
  Portal ID      `60076299713`
  Base URL       `https://people.zoho.in`

The frontend does **not** use the Zoho People base URL directly.

------------------------------------------------------------------------

## 4. API Base URL

For local development:

``` text
http://localhost:3000/server/employee_360_ai_function
```

Example:

``` text
http://localhost:3000/server/employee_360_ai_function/v1/employees/HRM2/360
```

The frontend should define the API base URL in one centralized
configuration/API client layer.

Do not repeat the backend URL throughout React components.

------------------------------------------------------------------------

# 5. Verified API Endpoints

  Method   Endpoint                                Purpose
  -------- --------------------------------------- -------------------------------
  GET      `/v1/zoho/status`                       Verify Zoho People connection
  GET      `/v1/zoho/employees`                    Retrieve employee directory
  GET      `/v1/employees/{employeeId}/360`        Retrieve/build Employee 360
  GET      `/v1/employees/{employeeId}/summary`    Employee Summary
  GET      `/v1/employees/{employeeId}/insights`   Employee Insights
  GET      `/v1/employees/{employeeId}/timeline`   Employee Timeline
  POST     `/v1/employees/{employeeId}/ask`        Ask AI

The frontend must use these endpoints rather than calling Zoho People
APIs directly.

------------------------------------------------------------------------

# 6. GET `/v1/zoho/status`

## Purpose

Checks whether the backend can communicate with Zoho People through the
configured Catalyst Connection.

## Request

``` http
GET /v1/zoho/status
```

No request body is required.

## Verified response

``` json
{
  "connected": true,
  "connectionName": "zohopeople_employee360_v2",
  "dataCenter": "in",
  "portalId": "60076299713",
  "organizationName": "VSK HR Solution Private Limited",
  "activeRecordsCount": 9,
  "message": "Catalyst Connection 'zohopeople_employee360_v2' verified successfully."
}
```

The endpoint may be used for a connection/health indicator. Do not
expose credentials or internal secrets.

------------------------------------------------------------------------

# 7. GET `/v1/zoho/employees`

## Purpose

Retrieves the employee directory from live Zoho People data through the
backend connector.

## Request

``` http
GET /v1/zoho/employees
```

## Verified behavior

The endpoint has been verified against live Zoho People data.

The current development dataset has been verified with 10 employee
records.

Repeated synchronization has been verified to: 1. insert missing
employee rows; 2. update existing employee rows; 3. avoid duplicate
employee rows.

## Verified source mapping

  API/Data concept     Zoho People source
  -------------------- -----------------------
  `employeeId`         `EmployeeID`
  `employeeNumber`     `EmployeeID`
  `sourceEmployeeId`   record ID / `Zoho_ID`
  `email`              employee email
  `status`             employee status

The employee persistence layer intentionally does not populate
`firstName` and `lastName` from `fullName`.

The frontend must handle missing name fields gracefully.

------------------------------------------------------------------------

# 8. GET `/v1/employees/{employeeId}/360`

## Purpose

Returns the Employee 360 representation for a specific employee.

## Example

``` http
GET /v1/employees/HRM2/360
```

Verified employee IDs include:

``` text
HRM2
HRM3
```

## Verified behavior

The endpoint has been verified to: 1. retrieve live Zoho People employee
data; 2. normalize source data; 3. construct the canonical Employee 360
model; 4. calculate supported deterministic information; 5. extract
evidence; 6. persist the Employee360 snapshot; 7. persist evidence where
applicable; 8. update existing records rather than creating duplicates.

## Canonical domains

``` text
employee
employment
organisation
attendance
leave
performance
goals
skills
learning
career
lifecycle
timeline
evidence
```

## Data Store mapping

The frontend consumes the API representation and should not depend on
Catalyst Data Store column names.

  Canonical domain   Data Store column
  ------------------ --------------------
  `employee`         `employeeProfile`
  `employment`       `employmentInfo`
  `organisation`     `organisationInfo`
  `leave`            `leaveInfo`
  `goals`            `goalsInfo`
  `skills`           `skillsInfo`
  `learning`         `learningInfo`
  `career`           `careerInfo`
  `lifecycle`        `lifecycleInfo`
  `timeline`         `timelineInfo`
  `evidence`         `evidenceInfo`

------------------------------------------------------------------------

# 9. Employee 360 Data Semantics

The Employee 360 model distinguishes:

``` text
Fact
Calculation
Trend
Correlation
AI Insight
Unknown
```

The frontend must preserve these semantics.

Missing or unknown data must not be silently converted into factual
values.

Examples:

``` text
null date → Not available
null manager → Not available
empty skills → No skill data available
empty timeline → No timeline events available
```

Exact UI wording is a frontend implementation decision.

The architectural rule is that missing information remains
missing/unknown.

------------------------------------------------------------------------

# 10. Evidence First

Evidence must be grounded in source data or deterministic calculation.

The frontend may display evidence returned by the backend but must not
create evidence.

Verified behavior includes: - HRM2: no fabricated evidence when source
evidence is missing. - HRM3: an email fact was persisted as evidence.

------------------------------------------------------------------------

# 11. GET `/v1/employees/{employeeId}/summary`

## Purpose

Returns the Employee Summary capability.

## Example

``` http
GET /v1/employees/HRM2/summary
```

The frontend should call the backend and display the returned summary.

The frontend must not generate a second Employee Summary locally.

### Schema status

The route is verified.

The complete response schema has not been frozen in this document. The
frontend must inspect the running endpoint before hardcoding detailed
response fields.

Do not invent fields.

------------------------------------------------------------------------

# 12. GET `/v1/employees/{employeeId}/insights`

## Purpose

Returns Employee 360 insights.

## Example

``` http
GET /v1/employees/HRM2/insights
```

The frontend should display backend-returned insights.

The frontend must not independently infer: - performance trends; - skill
gaps; - employee risks; - correlations; - sensitive characteristics; -
health or mental-state information; - promotion recommendations; -
compensation recommendations; - termination recommendations.

### Schema status

The route is verified.

The complete response schema must be inspected from the running backend
before detailed frontend models are finalized.

------------------------------------------------------------------------

# 13. GET `/v1/employees/{employeeId}/timeline`

## Purpose

Returns timeline information for an employee.

## Example

``` http
GET /v1/employees/HRM3/timeline
```

The timeline path has been locally verified.

For HRM3, the Zoho People `Dateofjoining` field was present in the
source record but returned `null`.

Therefore, no "Joined Company" event is generated.

The frontend must not invent lifecycle events.

------------------------------------------------------------------------

# 14. POST `/v1/employees/{employeeId}/ask`

## Purpose

Provides the Ask AI capability.

## Example request

``` http
POST /v1/employees/HRM2/ask
Content-Type: application/json

{
  "question": "What about last month?",
  "history": [
    { "role": "user", "content": "How has my attendance been?" },
    { "role": "assistant", "content": "Your attendance percentage is not recorded." }
  ]
}
```

`history` is optional. It holds earlier turns of the same conversation
(`role` is `user` or `assistant`, `content` a string). At most 50 turns
are accepted; only the last 6 non-empty turns (1000 characters each) are
used. History only helps resolve follow-up references; it never supplies
facts, evidence or permissions, and it is not stored.

## Expected conceptual response

``` json
{
  "answer": "...",
  "type": "...",
  "confidence": "...",
  "evidence": [],
  "limitations": [],
  "route": "employee"
}
```

`route` (additive) says how the answer was produced:

- `conversation`: greeting or small talk; no employee data, no AI.
- `general`: message with no employee topic: friendly small talk is
  answered briefly; any request for outside information is politely
  declined (the assistant never supplies outside knowledge). No employee
  data is used.
- `deterministic`: exact profile question answered from Employee 360 data, no AI.
- `organization`: organization-level question (headcount, team, pay)
  answered from the directory within the caller's scope, no AI.
- `employee`: AI answer grounded in the employee's Employee 360 context.

Non-employee routes carry `type: "Unknown"`, `confidence: "unknown"` and
no evidence, because they make no claim about the employee.
Organization answers cite `directory.*` references (the live Zoho People
employee directory fields used).

## GET `/v1/me`

Returns the caller's access: `authenticationEnabled`, `role`
(`admin`, `manager`, `employee`, or `development` while authentication
is disabled), `scope` (`all`, `team`, `self`), `employeeId` and
`allowedEmployeeIds` (`null` when unrestricted). Clients may use it to
show only what the backend allows; the backend still enforces every
request.

The exact final response schema must be verified from the running
backend before the frontend treats every field as mandatory.

The frontend: - sends the question; - displays the answer; - displays
evidence where provided; - displays confidence where provided; -
displays limitations where provided; - handles loading and errors.

The frontend does not perform AI reasoning.

------------------------------------------------------------------------

# 15. Security Boundary

The backend security flow is:

``` text
User
  ↓
Authentication
  ↓
Tenant
  ↓
Role
  ↓
Employee Scope
  ↓
Field Permissions
  ↓
Allowed Data
  ↓
Employee 360 Context
  ↓
AI
```

The frontend is downstream of this security boundary.

The frontend must not: - bypass employee scope; - bypass field
permissions; - trust frontend-only authorization; - expose backend
secrets; - expose Catalyst Connection credentials; - expose Zoho OAuth
tokens; - expose Gemini credentials.

The backend remains authoritative.

------------------------------------------------------------------------

# 16. Error Handling

The frontend should provide explicit states for:

``` text
loading
success
empty
not found
unauthorized
forbidden
network error
backend error
timeout
```

Do not expose: - stack traces; - access tokens; - OAuth credentials; -
Gemini API keys; - internal filesystem paths; - unnecessary
infrastructure details.

------------------------------------------------------------------------

# 17. Frontend API Client Rules

Use a centralized API client.

Recommended frontend structure:

``` text
src/
├── api/
│   ├── apiClient
│   ├── employeeService
│   ├── employee360Service
│   ├── summaryService
│   ├── insightsService
│   ├── timelineService
│   └── askAIService
```

These are frontend implementation recommendations, not backend
architecture requirements.

React components should not contain repeated raw API URLs or duplicate
fetch logic.

Preferred flow:

``` text
React Component
      ↓
Feature Hook / Service
      ↓
API Client
      ↓
Employee 360 Backend
```

------------------------------------------------------------------------

# 18. Zoho People Web Tab Boundary

The initial frontend target is a Zoho People Web Tab.

The Web Tab is an experience/consumer, not the Employee 360 intelligence
engine.

The Web Tab must not: - call Zoho People APIs directly; - contain the
Connector Layer; - contain deterministic HR intelligence; - contain
Evidence Layer logic; - contain AI reasoning; - store backend secrets.

It consumes the Employee 360 Headless API.

------------------------------------------------------------------------

# 19. Future Consumers

The same API boundary is intended to support:

``` text
Zoho People Web Tab
Zoho Cliq bot
Web applications
Mobile applications
Internal HR applications
External authorized API consumers
```

The frontend should therefore remain decoupled from Zoho People-specific
API implementation details.

------------------------------------------------------------------------

# 20. Gemini Boundary

Gemini is not currently integrated.

The Gemini API key exists but has intentionally not been added to the
backend environment yet.

The frontend must not: - contain `GEMINI_API_KEY`; - call Gemini
directly; - implement Gemini reasoning; - bypass the Employee 360 AI
Engine.

Expected future direction:

``` text
Frontend
   ↓
Employee 360 API
   ↓
AI Engine
   ↓
AI Provider Layer
   ↓
Gemini
```

------------------------------------------------------------------------

# 21. Data Store Boundary

The frontend must not communicate with Catalyst Data Store directly.

Backend tables include:

``` text
Tenants
Employees
Employee360
Evidence
TimelineEvents
SchemaRegistry
FieldMappings
SyncState
AIInteractions
```

The frontend consumes API responses and does not need Data Store table
IDs or persistence implementation details.

------------------------------------------------------------------------

# 22. Current Verification Status

## Verified

``` text
Zoho People connection
        ↓
Employee directory retrieval
        ↓
Employee persistence
        ↓
Employee upsert
        ↓
Canonical Employee 360
        ↓
Employee360 persistence
        ↓
Employee360 upsert
        ↓
Evidence extraction/persistence
        ↓
Timeline repository/query path
        ↓
REST API
```

Verified employees include:

``` text
HRM2
HRM3
```

## API response schemas requiring direct inspection

The following routes exist, but their complete response schemas should
be taken from actual running responses before the frontend hardcodes
detailed models:

``` text
/v1/employees/{employeeId}/summary
/v1/employees/{employeeId}/insights
/v1/employees/{employeeId}/ask
```

------------------------------------------------------------------------

# 23. Frontend Implementation Constraints

The frontend implementation must not require changes to:

``` text
backend package.json
backend package-lock.json
catalyst.json
Catalyst function configuration
Zoho People Connection
Zoho People scopes
Data Store tables
Data Store table IDs
backend authentication
backend connector architecture
canonical Employee 360 architecture
backend API routes
```

If a frontend requirement appears to require a backend change:

1.  stop;
2.  identify the exact requirement;
3.  identify the exact backend change;
4.  explain why it is required;
5.  obtain explicit approval before changing backend code.

Do not silently modify the backend.

------------------------------------------------------------------------

# 24. Source-of-Truth Rule

This document describes the verified API boundary as of Milestone 1.

Where this document does not define an exact response field, the
frontend must not invent one.

The running backend API response is authoritative for
implementation-level response details.

The original AI Employee 360 Technical Architecture & Implementation
Blueprint / BRD remains authoritative for overall architecture and
terminology.

------------------------------------------------------------------------

# 25. Frontend Acceptance Criteria

### API

-   [ ] Uses centralized API client.
-   [ ] Uses configurable API base URL.
-   [ ] Does not call Zoho People directly.
-   [ ] Does not expose secrets.
-   [ ] Uses existing Employee 360 API routes.
-   [ ] Handles API errors.
-   [ ] Handles loading states.
-   [ ] Handles empty/unknown values.

### Employee 360

-   [ ] Employee directory can be displayed.
-   [ ] Employee can be selected.
-   [ ] Employee 360 can be displayed.
-   [ ] Summary can be displayed.
-   [ ] Insights can be displayed.
-   [ ] Timeline can be displayed.
-   [ ] Evidence can be displayed where returned.
-   [ ] Ask AI can send a question to the backend.
-   [ ] Missing information remains missing/unknown.

### Architecture

-   [ ] Frontend remains an API consumer.
-   [ ] Backend business logic is not duplicated.
-   [ ] Zoho People connector logic remains backend-only.
-   [ ] Data Store remains backend-only.
-   [ ] AI reasoning remains backend-only.
-   [ ] Frontend is suitable for Zoho People Web Tab use.
-   [ ] Frontend can later be reused as another Employee 360 experience.

------------------------------------------------------------------------

# 26. Instruction for Frontend Code Generators

When this document is supplied to an AI coding assistant, treat the
existing backend as already implemented and verified.

Do not: - regenerate the backend; - modify backend configuration; -
modify backend `package.json`; - modify backend `package-lock.json`; -
create another Zoho People connection; - request a Zoho OAuth token; -
introduce `ZOHO_PEOPLE_AUTH_TOKEN`; - call Zoho People directly; -
expose `GEMINI_API_KEY`; - modify Data Store tables; - invent API
endpoints; - invent response fields; - move Employee 360 business logic
into React.

The frontend should be implemented as a separate consumer application.

------------------------------------------------------------------------

# 27. Current Status

``` text
Backend Milestone 1:
COMPLETE

Frontend API contract:
DEFINED FROM VERIFIED BACKEND BEHAVIOR

Frontend implementation:
NOT YET INTEGRATED

Gemini:
NOT YET INTEGRATED

Production deployment:
NOT YET STARTED
```

The next frontend activity should be to inspect the actual response
payloads of the existing endpoints and design React data
models/components around those verified responses.
