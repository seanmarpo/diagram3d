/**
 * examples.js
 *
 * A rotating set of example Mermaid flowchart diagrams used by the
 * "Load example" button.  Each entry has a name and a src string.
 */

export const EXAMPLES = [
  {
    name: 'Web architecture',
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
    name: 'CI/CD pipeline',
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
    name: 'Auth flow',
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
    name: 'Microservices',
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
    name: 'Data pipeline',
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
];

/** Returns examples in round-robin order across calls. */
let _idx = 0;
export function nextExample() {
  const ex = EXAMPLES[_idx % EXAMPLES.length];
  _idx++;
  return ex;
}
