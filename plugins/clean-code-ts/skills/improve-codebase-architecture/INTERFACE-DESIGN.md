# Interface Design

When the user wants to explore alternative interfaces for a chosen deepening candidate, use this parallel sub-agent pattern. Based on "Design It Twice" (Ousterhout) — your first idea is unlikely to be the best.

Uses the vocabulary in [LANGUAGE.md](LANGUAGE.md) — **module**, **interface**, **seam**, **adapter**, **leverage**.

## Process

### 1. Frame the problem space

Before spawning sub-agents, write a user-facing explanation of the problem space for the chosen candidate:

- The constraints any new interface would need to satisfy
- The dependencies it would rely on, and which category they fall into (see [DEEPENING.md](DEEPENING.md))
- A rough illustrative code sketch in TypeScript to ground the constraints — not a proposal, just a way to make the constraints concrete

Show this to the user, then immediately proceed to Step 2. The user reads and thinks while the sub-agents work in parallel.

### 2. Spawn sub-agents

Spawn 3+ sub-agents in parallel using the Agent tool. Each must produce a **radically different** interface for the deepened module.

Prompt each sub-agent with a separate technical brief (file paths, coupling details, dependency category from [DEEPENING.md](DEEPENING.md), what sits behind the seam). The brief is independent of the user-facing problem-space explanation in Step 1. Give each agent a different design constraint:

- Agent 1: "Minimize the interface — aim for 1–3 entry points max. Maximise leverage per entry point."
- Agent 2: "Maximise flexibility — support many use cases and extension."
- Agent 3: "Optimise for the most common caller — make the default case trivial."
- Agent 4 (if applicable): "Design around ports & adapters for cross-seam dependencies."

Include both [LANGUAGE.md](LANGUAGE.md) vocabulary and the project's domain-glossary vocabulary (typically `docs/glossary.md` or a `## Domain language` section in `CLAUDE.md`) in the brief so each sub-agent names things consistently with the architecture language and the project's domain language.

Each sub-agent outputs:

1. Interface (TS types, methods, params — plus invariants, ordering, error modes)
2. Usage example showing how callers use it (TypeScript snippet, not pseudocode)
3. What the implementation hides behind the seam
4. Dependency strategy and adapters (see [DEEPENING.md](DEEPENING.md))
5. Trade-offs — where leverage is high, where it's thin

### 3. Present and compare

Present designs sequentially so the user can absorb each one, then compare them in prose. Contrast by **depth** (leverage at the interface), **locality** (where change concentrates), and **seam placement**.

After comparing, give your own recommendation: which design you think is strongest and why. If elements from different designs would combine well, propose a hybrid. Be opinionated — the user wants a strong read, not a menu.

## TypeScript idioms for designing interfaces

Apply these by default. They sharpen the surface that callers and tests cross.

### Discriminated unions over boolean flags or class hierarchies

```ts
// Shallow — boolean + optional fields make every caller branch
type Order = {
  status: "pending" | "confirmed" | "cancelled";
  cancelledReason?: string;
  confirmedAt?: Date;
};

// Deep — the discriminator makes invalid states unrepresentable
type Order =
  | { status: "pending" }
  | { status: "confirmed"; confirmedAt: Date }
  | { status: "cancelled"; reason: string };
```

The narrower interface is also easier to test — fewer branches and no impossible combinations.

### Branded types for invariants

```ts
type OrderId = string & { readonly __brand: "OrderId" };

function parseOrderId(raw: string): OrderId {
  if (!/^ord_[a-z0-9]{12}$/.test(raw)) throw new Error("invalid OrderId");
  return raw as OrderId;
}
```

The branded type carries the invariant across the seam; callers can stop revalidating. One adapter (`parseOrderId`) at the entry point replaces N runtime checks.

### `unknown` at boundaries, narrow inwards

`any` is an escape hatch in the implementation; `unknown` is honesty in the interface. Anything coming from the network, a file, or a third-party SDK should land as `unknown` and be narrowed through a parser (Zod, io-ts, or a hand-written type guard) before crossing the seam.

### Option objects with strict types — not positional booleans

```ts
// Shallow — every call site reads as `createOrder(id, true, false, undefined)`
function createOrder(id: OrderId, urgent: boolean, dryRun: boolean, channel?: string): Order;

// Deep — named, narrow types
type CreateOrderOptions = {
  urgent?: boolean;
  dryRun?: boolean;
  channel?: "web" | "mobile" | "api";
};
function createOrder(id: OrderId, options?: CreateOrderOptions): Order;
```

### Ports as TS `interface`, not abstract classes

```ts
// Port — defines the seam
interface OrderRepository {
  findById(id: OrderId): Promise<Order | null>;
  save(order: Order): Promise<void>;
}

// Production adapter
class PostgresOrderRepository implements OrderRepository { /* ... */ }

// Test adapter — in-memory fake
class InMemoryOrderRepository implements OrderRepository { /* ... */ }
```

Structural typing means the deep module depends on the shape, not the class. Tests inject the in-memory adapter; production wires the Postgres one.

### Avoid `enum`; prefer string unions

```ts
// Avoid — enum is nominal in TS and has runtime baggage
enum Status { Pending, Ready, Failed }

// Prefer — string union: zero runtime cost, narrows cleanly
type Status = "pending" | "ready" | "failed";
```

### Readonly-by-default at the interface

```ts
function applyDiscount(order: Readonly<Order>, pct: number): Order { /* ... */ }
```

Callers can't mutate state through the seam. Mutation, when it happens, is local to the implementation.
