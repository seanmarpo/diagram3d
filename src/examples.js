/**
 * examples.js
 *
 * A rotating set of example diagrams used by the "Load example" button.
 * Each entry has a name, a format ('mermaid' | 'excalidraw'), and a src string.
 */

export const EXAMPLES = [
  {
    name: "Web architecture",
    format: "mermaid",
    src: `flowchart LR
  Browser[Browser] --> LB[Load Balancer]
  LB --> API1[API Server 1]
  LB --> API2[API Server 2]
  API1 --> Cache[(Redis Cache)]
  API2 --> Cache
  API1 --> DB[(PostgreSQL)]
  API2 --> DB
  API1 --> Queue[Message Queue]
  API2 --> Queue
  Queue --> Worker1[Worker 1]
  Queue --> Worker2[Worker 2]
  Worker1 --> Storage[(Object Storage)]
  Worker2 --> Storage`,
  },
  {
    name: "CI/CD pipeline",
    format: "mermaid",
    src: `flowchart TD
  Push[Git Push] --> CI{CI Checks}
  CI -->|pass| Build[Build & Bundle]
  CI -->|fail| Notify[Notify Developer]
  Build --> Test[Run Tests]
  Test -->|pass| Docker[Build Docker Image]
  Test -->|fail| Notify
  Docker --> Registry[(Container Registry)]
  Registry --> Staging[Deploy to Staging]
  Staging --> Smoke[Smoke Tests]
  Smoke -->|pass| Approval{Manual Approval}
  Smoke -->|fail| Rollback[Rollback Staging]
  Approval -->|approved| Prod[Deploy to Production]
  Approval -->|rejected| Notify`,
  },
  {
    name: "Auth flow",
    format: "mermaid",
    src: `flowchart TD
  Start((Start)) --> Login[Login Request]
  Login --> Valid{Credentials Valid?}
  Valid -->|no| Fail[Return 401]
  Valid -->|yes| MFA{MFA Enabled?}
  MFA -->|no| Token[Issue JWT]
  MFA -->|yes| OTP[Send OTP]
  OTP --> Verify{OTP Valid?}
  Verify -->|no| Fail
  Verify -->|yes| Token
  Token --> Session[(Store Session)]
  Session --> Done((Done))
  Fail --> Done`,
  },
  {
    name: "Microservices",
    format: "mermaid",
    src: `flowchart LR
  Gateway[API Gateway] --> Auth[Auth Service]
  Gateway --> Users[User Service]
  Gateway --> Orders[Order Service]
  Gateway --> Products[Product Service]
  Orders --> Inventory[Inventory Service]
  Orders --> Payment[Payment Service]
  Orders --> Notify[Notification Service]
  Payment --> Stripe[Stripe API]
  Notify --> Email[Email Provider]
  Notify --> SMS[SMS Provider]
  Users --> UserDB[(Users DB)]
  Orders --> OrderDB[(Orders DB)]
  Products --> ProductDB[(Products DB)]
  Inventory --> InvDB[(Inventory DB)]`,
  },
  {
    name: "Data pipeline",
    format: "mermaid",
    src: `flowchart LR
  Ingest[Data Ingest] --> Validate{Schema Valid?}
  Validate -->|yes| Clean[Clean & Normalise]
  Validate -->|no| DLQ[(Dead Letter Queue)]
  Clean --> Enrich[Enrich]
  Enrich --> Transform[Transform]
  Transform --> Aggregate[Aggregate]
  Aggregate --> Warehouse[(Data Warehouse)]
  Warehouse --> Reports[Reporting Layer]
  Warehouse --> ML[ML Feature Store]
  ML --> Train[Model Training]
  Train --> Registry[(Model Registry)]
  Registry --> Serve[Model Serving]`,
  },
  // ── Excalidraw examples ────────────────────────────────────────────────
  {
    name: "Excalidraw: Request flow",
    format: "excalidraw",
    src: JSON.stringify(
      {
        type: "excalidraw",
        version: 2,
        elements: [
          {
            id: "client",
            type: "rectangle",
            x: 0,
            y: 0,
            width: 120,
            height: 60,
            strokeStyle: "solid",
            label: { text: "Client" },
          },
          {
            id: "gateway",
            type: "rectangle",
            x: 200,
            y: 0,
            width: 120,
            height: 60,
            strokeStyle: "solid",
            label: { text: "API Gateway" },
          },
          {
            id: "auth",
            type: "rectangle",
            x: 400,
            y: -80,
            width: 120,
            height: 60,
            strokeStyle: "solid",
            label: { text: "Auth Service" },
          },
          {
            id: "api",
            type: "rectangle",
            x: 400,
            y: 80,
            width: 120,
            height: 60,
            strokeStyle: "solid",
            label: { text: "API Service" },
          },
          {
            id: "db",
            type: "ellipse",
            x: 600,
            y: 80,
            width: 120,
            height: 60,
            strokeStyle: "solid",
            label: { text: "Database" },
          },
          {
            id: "cache",
            type: "diamond",
            x: 600,
            y: -80,
            width: 120,
            height: 60,
            strokeStyle: "solid",
            label: { text: "Cache" },
          },
          {
            id: "e1",
            type: "arrow",
            startBinding: { elementId: "client" },
            endBinding: { elementId: "gateway" },
            strokeStyle: "solid",
            label: { text: "HTTP" },
          },
          {
            id: "e2",
            type: "arrow",
            startBinding: { elementId: "gateway" },
            endBinding: { elementId: "auth" },
            strokeStyle: "dashed",
            label: { text: "verify" },
          },
          {
            id: "e3",
            type: "arrow",
            startBinding: { elementId: "gateway" },
            endBinding: { elementId: "api" },
            strokeStyle: "solid",
            label: { text: "proxy" },
          },
          {
            id: "e4",
            type: "arrow",
            startBinding: { elementId: "api" },
            endBinding: { elementId: "cache" },
            strokeStyle: "dashed",
            label: { text: "lookup" },
          },
          {
            id: "e5",
            type: "arrow",
            startBinding: { elementId: "api" },
            endBinding: { elementId: "db" },
            strokeStyle: "solid",
            label: { text: "query" },
          },
        ],
      },
      null,
      2,
    ),
  },
  {
    name: "Excalidraw: CI pipeline",
    format: "excalidraw",
    src: JSON.stringify(
      {
        type: "excalidraw",
        version: 2,
        elements: [
          {
            id: "push",
            type: "rectangle",
            x: 0,
            y: 0,
            width: 120,
            height: 60,
            strokeStyle: "solid",
            label: { text: "Git Push" },
          },
          {
            id: "lint",
            type: "rectangle",
            x: 200,
            y: -80,
            width: 120,
            height: 60,
            strokeStyle: "solid",
            label: { text: "Lint" },
          },
          {
            id: "test",
            type: "rectangle",
            x: 200,
            y: 80,
            width: 120,
            height: 60,
            strokeStyle: "solid",
            label: { text: "Tests" },
          },
          {
            id: "build",
            type: "rectangle",
            x: 400,
            y: 0,
            width: 120,
            height: 60,
            strokeStyle: "solid",
            label: { text: "Build" },
          },
          {
            id: "image",
            type: "rectangle",
            x: 600,
            y: 0,
            width: 120,
            height: 60,
            strokeStyle: "solid",
            label: { text: "Docker Image" },
          },
          {
            id: "staging",
            type: "ellipse",
            x: 800,
            y: -80,
            width: 120,
            height: 60,
            strokeStyle: "solid",
            label: { text: "Staging" },
          },
          {
            id: "prod",
            type: "ellipse",
            x: 800,
            y: 80,
            width: 120,
            height: 60,
            strokeStyle: "solid",
            label: { text: "Production" },
          },
          {
            id: "notify",
            type: "diamond",
            x: 400,
            y: 160,
            width: 120,
            height: 60,
            strokeStyle: "solid",
            label: { text: "Notify" },
          },
          {
            id: "e1",
            type: "arrow",
            startBinding: { elementId: "push" },
            endBinding: { elementId: "lint" },
            strokeStyle: "solid",
          },
          {
            id: "e2",
            type: "arrow",
            startBinding: { elementId: "push" },
            endBinding: { elementId: "test" },
            strokeStyle: "solid",
          },
          {
            id: "e3",
            type: "arrow",
            startBinding: { elementId: "lint" },
            endBinding: { elementId: "build" },
            strokeStyle: "solid",
            label: { text: "pass" },
          },
          {
            id: "e4",
            type: "arrow",
            startBinding: { elementId: "test" },
            endBinding: { elementId: "build" },
            strokeStyle: "solid",
            label: { text: "pass" },
          },
          {
            id: "e5",
            type: "arrow",
            startBinding: { elementId: "test" },
            endBinding: { elementId: "notify" },
            strokeStyle: "dashed",
            label: { text: "fail" },
          },
          {
            id: "e6",
            type: "arrow",
            startBinding: { elementId: "build" },
            endBinding: { elementId: "image" },
            strokeStyle: "solid",
          },
          {
            id: "e7",
            type: "arrow",
            startBinding: { elementId: "image" },
            endBinding: { elementId: "staging" },
            strokeStyle: "solid",
          },
          {
            id: "e8",
            type: "arrow",
            startBinding: { elementId: "staging" },
            endBinding: { elementId: "prod" },
            strokeStyle: "solid",
            label: { text: "approve" },
          },
        ],
      },
      null,
      2,
    ),
  },
];

/** Returns examples in round-robin order across calls. */
let _idx = 0;
export function nextExample() {
  const ex = EXAMPLES[_idx % EXAMPLES.length];
  _idx++;
  return ex;
}
