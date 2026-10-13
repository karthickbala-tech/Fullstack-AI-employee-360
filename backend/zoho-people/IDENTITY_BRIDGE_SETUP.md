# Zoho People Web Tab identity bridge: setup and validation

The Web Tab proves who is signed in by asking Zoho People (server side) for a
short-lived signed assertion. The Catalyst backend verifies it and decides
access. The browser only forwards it.

```text
Web Tab (React)
  -> ZOHO.People.API.invokeStandaloneFunction("e360_identity_assertion")
  -> Zoho People Deluge: zoho.loginuserid + HMAC-SHA256(secret)
  -> assertion back to the Web Tab
  -> e360Assertion field in the body of a text/plain POST to the same API route
  -> Catalyst: verify, map email to employee, apply scope, then data and AI
```

### Why the body and not a header (CORS)

Measured on Development (2026-10-10):

- A request with a custom header (`x-e360-assertion`) makes the browser send a
  preflight `OPTIONS` first. The Catalyst gateway answers it itself (HTTP 200,
  `Server: ZGS`) with no `Access-Control-Allow-*` headers, and the function
  never sees it, so the browser would block the real request.
- A `text/plain` POST is a CORS "simple" request: the browser sends no
  preflight. The gateway passes it to the function, and the function's own
  `Access-Control-Allow-Origin` comes back (a `text/plain` POST to `/v1/me` and
  `/ask` both reached the function and returned that header).

So the Web Tab sends `{"e360Assertion": "..."}` as a text/plain POST body.
The read routes (`/v1/me`, `/v1/zoho/status`, `/v1/zoho/employees`, and the
employee `360`/`summary`/`insights`/`timeline` routes) accept POST as well as
GET, and Ask carries the field next to `question`. The token never goes in the
URL. The backend removes the field from the body before any controller sees it.
It rejects a request that sends the token both in the header and in the body.
API clients that can send custom headers may still use `x-e360-assertion`.
This needs no Catalyst console change and no login page.

## Assertion format (must match `middleware/zohoPeopleAssertion.js`)

```text
token     = base64url(payload) "." base64url(HMAC-SHA256(secret, payload))
payload   = 1|e360_webtab|<email>|<portalId>|<iat>|<exp>|<nonce>
email     = zoho.loginuserid
portalId  = 60076299713 (must equal the backend tenant portal)
iat, exp  = Unix seconds; exp - iat = 240 (backend maximum 300, clock skew 30)
nonce     = 16-128 characters of A-Z a-z 0-9 - _
base64url = standard base64 with + -> -, / -> _, and = removed
secret    = same value in Zoho People and Catalyst, at least 32 characters
```

`tests/identityAssertionVector.test.js` checks this pipeline and a fixed test
vector against the verifier.

## Platform limitation: where the secret lives in Zoho People

Zoho People Deluge has no documented secret store that a function can read as a
raw value. Connections hold OAuth credentials for outgoing calls; they don't
expose a signing key to the script. So the signing secret has to be written
into the function source in Zoho People. Anyone who can view or edit Zoho People
functions (Developer Space) can read it, and could create assertions for any
email.

Mitigations (required):

- Limit Developer Space / function edit access to the people who already
  administer the integration.
- Never put the value in this repository, in a chat, in the frontend, or in
  `catalyst-config.json`.
- Rotate the secret (both sides) when someone with that access leaves, and if
  it is ever exposed.
- The assertion lives 4 minutes and is bound to the portal, so a leaked
  assertion (not the secret) is short-lived.

## Manual steps

Do these in order. Don't turn on `AUTHENTICATION_ENABLED` until step 7 passes.

### 1. Check the Deluge pipeline with the test vector

1. In Zoho People > Settings > Developer Space > Functions, create a temporary
   standalone function from `e360_identity_assertion_vector_check.deluge`.
2. Save & Execute. The output must show `"matches":true`, and
   `unixSecondsNow` must be within a few seconds of the real Unix time
   (https://www.epochconverter.com).
3. Delete that temporary function.

If `matches` is false or the time is off, stop: report the output, and don't
create the real function.

### 2. Generate the signing secret (once)

On your own machine, in a terminal (do not paste it anywhere else):

```text
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

### 3. Configure the secret in Catalyst (Development first)

Add the environment variable `E360_IDENTITY_ASSERTION_SECRET` to the function
`employee_360_ai_function`.

How deploys treat environment variables on this project (observed, not from
documentation): `catalyst deploy --only functions:employee_360_ai_function`
applies `deployment.env_variables` from
`functions/employee_360_ai_function/catalyst-config.json`. A deploy with an
empty list removed `GEMINI_API_KEY` that had been set in the console. So a
variable set only in the console may be removed by the next deploy.

That file is tracked by git. The committed version has an empty
`env_variables`, and your local copy holds `GEMINI_API_KEY` (an uncommitted
change). Two supported options:

- A. Console only: Catalyst console > Serverless > Functions >
  `employee_360_ai_function` > Configuration > Environment Variables > add
  `E360_IDENTITY_ASSERTION_SECRET`. After every deploy, check it is still
  there; re-add it if not.
- B. Local config: add `"E360_IDENTITY_ASSERTION_SECRET": "<secret>"` next to
  `GEMINI_API_KEY` in your local `catalyst-config.json`, so deploys keep it.
  The file then holds two secrets, so never stage it. Run
  `node backend/tools/check-staged-secrets.js` before every commit. It fails
  if the staged copy of that file has any non-empty value, and it never prints
  values.

Either way, the secret never goes in a commit, the frontend or a chat.

### 4. Create the real Zoho People function

1. Create a standalone function named exactly `e360_identity_assertion`, with
   no arguments and return type string, from `e360_identity_assertion.deluge`.
2. Replace `REPLACE_WITH_SIGNING_SECRET` with the secret, in Zoho People only.
3. Give it the same availability or permission settings as `e360_identity_probe`,
   which the Web Tab could already call.
4. Save & Execute once. The output is `{"assertion":"..."}`.

Check that assertion locally (it prints validity and the email, never the
secret):

```text
set E360_IDENTITY_ASSERTION_SECRET=<secret>        (cmd)   or   $env:E360_IDENTITY_ASSERTION_SECRET="<secret>"   (PowerShell)
node backend/tools/check-identity-assertion.js <assertion>
```

You should see `VALID email=<your login email> ... lifetime=240s`.

### 5. Deploy the backend to Development (with your approval)

The body transport and the POST read routes are new backend code. Development
must run it before the Web Tab can use it: `catalyst deploy --only
functions:employee_360_ai_function`, with `AUTHENTICATION_ENABLED` still
false. Then check from a terminal:

```text
curl -s -X POST "https://employee360-ai-60085182165.development.catalystserverless.in/server/employee_360_ai_function/v1/me" -H "Content-Type: text/plain;charset=UTF-8" --data "{}"
```

Pass: `{"success":true,"data":{"authenticationEnabled":false,...}}`. Before the
deploy, the same call returns HTTP 405.

No CORS console change is needed for this transport. Catalyst Authorized
Domains is not required. Don't add it as a substitute, and don't enable API
Gateway for this.

### 6. Check each role inside the Web Tab (authentication still off)

Upload the new `frontend/dist/frontend.zip`, switch the Web Tab to Live, and
for an Admin, a Manager and a Team member user:

- DevTools > Network: backend requests are `POST` with
  `Content-Type: text/plain`, there are no `OPTIONS` requests and no CORS
  errors, and no URL contains the assertion.
- Click one request > Payload: copy the `e360Assertion` value and run
  `node backend/tools/check-identity-assertion.js <assertion>`: it must be
  VALID with that user's own login email. The same email for every user means
  the function is not running as the viewer: stop. The value is a live
  credential for about 4 minutes: don't paste it anywhere else.
- If `invokeStandaloneFunction` fails for the Manager or Team member (the
  SDK documentation says it needs automation admin permission), the Web Tab
  shows "identity function ... did not return an assertion". Then check the
  function's permission settings in Developer Space. If non-admins cannot be
  allowed, the bridge can't work for them: stop and report it.

### 7. Turn authentication on (Development only)

Only after steps 1-6 pass: set `AUTHENTICATION_ENABLED = true` in
`config/environment.js`, deploy to Development, and check:

- `/v1/me` per user: Team member has `scope: self` and only their own record.
  A manager has `scope: team`, themselves plus verified direct reports.
  Nobody has `canAnalyzeOrganization: true` unless their employee ID is in
  `organizationAccess.employeeIds`.
- Typing another employee ID into the selector gives 403 for anyone outside
  scope.
- "What is my department?" while viewing a report answers with the asker's own
  department.

To grant organization-wide access, add the employee IDs to
`organizationAccess.employeeIds` in `config/environment.js`. Zoho Role
matching (`zohoRoles`) stays off until the Role field key is verified in live
directory records (`ZOHO_ROLE_FIELD_VERIFIED`).

### 8. Remove the probe

When the real function works, delete the Zoho People function
`e360_identity_probe`.
