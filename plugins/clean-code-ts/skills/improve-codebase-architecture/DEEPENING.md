# Deepening

How to deepen a cluster of shallow modules safely, given its dependencies. Assumes the vocabulary in [LANGUAGE.md](LANGUAGE.md) — **module**, **interface**, **seam**, **adapter**.

## Dependency categories

When assessing a candidate for deepening, classify its dependencies. The category determines how the deepened module is tested across its seam.

### 1. In-process

Pure computation, in-memory state, no I/O. Always deepenable — merge the modules and test through the new interface directly. No adapter needed.

**TypeScript flavour**: prefer pure functions over methods on a class when nothing needs to be hidden behind a `this`. Use `Readonly<T>` and `as const` to make purity visible at the type level.

### 2. Local-substitutable

Dependencies that have local test stand-ins (PGLite for Postgres, in-memory filesystem). Deepenable if the stand-in exists. The deepened module is tested with the stand-in running in the test suite. The seam is internal; no port at the module's external interface.

**TypeScript flavour**: pin the stand-in to the same TS interface as production via structural typing. If `pg` returns `{ rows: T[] }` and PGLite mirrors it, the deepened module sees one type — no adapter shim needed.

### 3. Remote but owned (Ports & Adapters)

Your own services across a network boundary (microservices, internal APIs). Define a **port** (interface) at the seam. The deep module owns the logic; the transport is injected as an **adapter**. Tests use an in-memory adapter. Production uses an HTTP/gRPC/queue adapter.

Recommendation shape: *"Define a port at the seam, implement an HTTP adapter for production and an in-memory adapter for testing, so the logic sits in one deep module even though it's deployed across a network."*

**TypeScript flavour**:

```ts
// Port — pure TS interface, transport-agnostic
interface InventoryGateway {
  reserve(sku: SKU, qty: number): Promise<Reservation>;
  release(reservation: ReservationId): Promise<void>;
}

// Adapters
class HttpInventoryGateway implements InventoryGateway { /* fetch + zod */ }
class InMemoryInventoryGateway implements InventoryGateway { /* Map + Promise.resolve */ }
```

The deep module accepts `InventoryGateway` in its constructor or factory. The interface IS the port; no separate "abstract gateway class" needed.

### 4. True external (Mock)

Third-party services (Stripe, Twilio, etc.) you don't control. The deepened module takes the external dependency as an injected port; tests provide a mock adapter.

**TypeScript flavour**: even if the third-party SDK exposes 50 methods, your port should expose only the 2–3 your module actually needs. The port is **your** vocabulary, not theirs — that's where leverage comes from. Use `Pick<>` or a hand-written interface to keep the surface narrow; never re-export the vendor type as your seam.

## Seam discipline

- **One adapter means a hypothetical seam. Two adapters means a real one.** Don't introduce a port unless at least two adapters are justified (typically production + test). A single-adapter seam is just indirection.
- **Internal seams vs external seams.** A deep module can have internal seams (private to its implementation, used by its own tests) as well as the external seam at its interface. Don't expose internal seams through the interface just because tests use them.
- **In TypeScript**: a port is `interface Foo {}` or `type Foo = {}`. Reach for the keyword that reads best at the call site, not the one that signals "this is a port". Structural typing means the deep module doesn't care.

## Testing strategy: replace, don't layer

- Old unit tests on shallow modules become waste once tests at the deepened module's interface exist — delete them.
- Write new tests at the deepened module's interface. The **interface is the test surface**.
- Tests assert on observable outcomes through the interface, not internal state.
- Tests should survive internal refactors — they describe behaviour, not implementation. If a test has to change when the implementation changes, it's testing past the interface.
- **In TypeScript**: assert on the *types* the deepened module returns, not just the runtime values. A test that compiles with the wrong return type is a test that lies. Use `expectTypeOf` / `assertType` (vitest, tsd) when the type itself is part of the contract.
