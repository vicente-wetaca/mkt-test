# Language

Shared vocabulary for every suggestion this skill makes. Use these terms exactly — don't substitute "component," "service," "API," or "boundary." Consistent language is the whole point.

## Terms

**Module**
Anything with an interface and an implementation. Deliberately scale-agnostic — applies equally to a function, class, package, or tier-spanning slice.
_Avoid_: unit, component, service.

**Interface**
Everything a caller must know to use the module correctly. Includes the TS type signature, but also invariants, ordering constraints, error modes, required configuration, and performance characteristics.
_Avoid_: API, signature (too narrow — those refer only to the type-level surface).

**Implementation**
What's inside a module — its body of code. Distinct from **Adapter**: a thing can be a small adapter with a large implementation (a Postgres repo) or a large adapter with a small implementation (an in-memory fake). Reach for "adapter" when the seam is the topic; "implementation" otherwise.

**Depth**
Leverage at the interface — the amount of behaviour a caller (or test) can exercise per unit of interface they have to learn. A module is **deep** when a large amount of behaviour sits behind a small interface. A module is **shallow** when the interface is nearly as complex as the implementation.

**Seam** _(from Michael Feathers)_
A place where you can alter behaviour without editing in that place. The *location* at which a module's interface lives. Choosing where to put the seam is its own design decision, distinct from what goes behind it.
_Avoid_: boundary (overloaded with DDD's bounded context).

**Adapter**
A concrete thing that satisfies an interface at a seam. Describes *role* (what slot it fills), not substance (what's inside).

**Leverage**
What callers get from depth. More capability per unit of interface they have to learn. One implementation pays back across N call sites and M tests.

**Locality**
What maintainers get from depth. Change, bugs, knowledge, and verification concentrate at one place rather than spreading across callers. Fix once, fixed everywhere.

## Principles

- **Depth is a property of the interface, not the implementation.** A deep module can be internally composed of small, mockable, swappable parts — they just aren't part of the interface. A module can have **internal seams** (private to its implementation, used by its own tests) as well as the **external seam** at its interface.
- **The deletion test.** Imagine deleting the module. If complexity vanishes, the module wasn't hiding anything (it was a pass-through). If complexity reappears across N callers, the module was earning its keep.
- **The interface is the test surface.** Callers and tests cross the same seam. If you want to test *past* the interface, the module is probably the wrong shape.
- **One adapter means a hypothetical seam. Two adapters means a real one.** Don't introduce a seam unless something actually varies across it.

## Relationships

- A **Module** has exactly one **Interface** (the surface it presents to callers and tests).
- **Depth** is a property of a **Module**, measured against its **Interface**.
- A **Seam** is where a **Module**'s **Interface** lives.
- An **Adapter** sits at a **Seam** and satisfies the **Interface**.
- **Depth** produces **Leverage** for callers and **Locality** for maintainers.

## TypeScript naming conventions

Names are part of the interface. Bad names shallow a module by forcing callers to read the implementation to know what it does.

- **Avoid vacuous nouns**: `Data`, `Info`, `Manager`, `Helper`, `Util`, `Service` (when it means nothing), `Handler`, `Processor`. They tell the reader nothing about what's behind the seam. If you can't name the module without one of these, the seam is probably wrong.
- **Verbs for functions, nouns for modules**. `createOrder(input): Order` and a module called `orderIntake` — not `OrderHandler.process(input)`.
- **Suffixes that earn their place**: `Repository` (CRUD over persistence), `Gateway` (port to an external service), `Policy` (a decision encapsulated as data or strategy). Use them when they carry meaning, not as decoration.
- **Domain glossary wins**. If the glossary calls it "Order," the module is `orderIntake` / `OrderRepository` / `OrderCancellationPolicy` — not "TransactionPayload," not "OrderDTO" if "Order" already exists as a concept.
- **Type names: `PascalCase`; value names: `camelCase`; constants: `SCREAMING_SNAKE` only for true compile-time constants**.

## Rejected framings

- **Depth as ratio of implementation-lines to interface-lines** (Ousterhout): rewards padding the implementation. We use depth-as-leverage instead.
- **"Interface" as just the TypeScript `interface` keyword or a class's public methods**: too narrow — interface here includes every fact a caller must know, including the types that flow through it.
- **"Boundary"**: overloaded with DDD's bounded context. Say **seam** or **interface**.
- **`enum` as a sealed enumeration**: use string union types. They produce narrower interfaces, no runtime baggage, and survive `JSON.parse` cleanly.
- **`any` as "I don't know the type yet"**: use `unknown` and narrow. `any` opts out of the type system; `unknown` keeps the seam honest.
