# RestrOS — API Contracts

Three surfaces, each with a different consumer and a different security posture.

| Surface | Consumer | Transport | Auth |
| --- | --- | --- | --- |
| **Internal** | The RestrOS web app | tRPC over server actions | Session cookie + tenant middleware |
| **Device** | POS terminals, KDS screens | REST + WebSocket | Device token + shift token |
| **Public** | Tenant integrations (Scale plan) | REST | API key with scopes |

All three validate against the same Zod schemas in `packages/contracts`, so a
contract change breaks every consumer at build time rather than at runtime.

---

## 1. Conventions

**Base:** `https://{tenant}.restros.in/api/v1`

| Rule | Detail |
| --- | --- |
| Money | Integer paise in every request and response. Never a formatted string. |
| Time | ISO 8601 with offset: `2026-08-27T20:12:00+05:30`. |
| IDs | Opaque strings. Never parse them. |
| Casing | `camelCase` in JSON. |
| Pagination | Cursor-based: `?limit=50&cursor=…`, response carries `nextCursor` (null when exhausted). |
| Idempotency | Required on every mutating device request via `Idempotency-Key` (a ULID). |
| Errors | RFC 9457 `application/problem+json`. |
| Rate limits | `X-RateLimit-{Limit,Remaining,Reset}` on every response. |

### Error shape

```json
{
  "type": "https://docs.restros.in/errors/item-not-sellable",
  "title": "Item cannot be sold",
  "status": 422,
  "detail": "Fish Fry has no price set and cannot be added to an order.",
  "instance": "/api/v1/orders/ord_2497/lines",
  "code": "ITEM_PENDING_PRICE",
  "meta": { "itemId": "itm_fish_fry" }
}
```

`code` is the stable, machine-readable contract. `title` and `detail` are for
humans and may be reworded without a version bump.

### Error codes

| Code | Status | Meaning |
| --- | --- | --- |
| `UNAUTHENTICATED` | 401 | No valid session, device or API key |
| `FORBIDDEN_CAPABILITY` | 403 | Authenticated, but the role lacks the capability |
| `TENANT_MISMATCH` | 403 | The resource belongs to another tenant |
| `NOT_FOUND` | 404 | Absent, or invisible to this tenant — deliberately indistinguishable |
| `DUPLICATE_EVENT` | 409 | Idempotency key already accepted; **treat as success** |
| `STALE_MENU_VERSION` | 409 | The terminal is billing against a superseded menu |
| `ITEM_PENDING_PRICE` | 422 | The item has no price and cannot be sold |
| `ITEM_UNAVAILABLE` | 422 | The item is 86'd |
| `PLAN_LIMIT_EXCEEDED` | 402 | Outlet or seat cap reached |
| `RATE_LIMITED` | 429 | Back off; honour `Retry-After` |

---

## 2. Internal API (tRPC)

Consumed only by `apps/web`. Grouped by domain; every procedure runs inside
`withTenant()` and re-checks capability server-side.

```ts
export const appRouter = router({
  menu: router({
    current:      publicProcedure.input(z.object({ outletId: z.string().optional() })).query(…),
    draft:        protectedProcedure.query(…),
    upsertItem:   protectedProcedure.use(can('menu.edit')).input(ItemInput).mutation(…),
    setAvailable: protectedProcedure.use(can('menu.edit')).input(AvailabilityInput).mutation(…),
    applyAnnotation: protectedProcedure.use(can('menu.edit')).input(z.object({
      itemId: z.string(),
      accept: z.boolean(),          // false = dismiss the handwritten suggestion
    })).mutation(…),
    publish:      protectedProcedure.use(can('menu.publish')).input(z.object({
      note: z.string().max(200).optional(),
    })).mutation(…),
    versions:     protectedProcedure.query(…),
    rollback:     protectedProcedure.use(can('menu.publish')).input(z.object({ version: z.number() })).mutation(…),
  }),

  order: router({
    list:     protectedProcedure.input(OrderFilter).query(…),
    byId:     protectedProcedure.input(z.object({ id: z.string() })).query(…),
    open:     protectedProcedure.input(z.object({ outletId: z.string() })).query(…),
    submit:   protectedProcedure.use(can('order.create')).input(SubmitOrder).mutation(…),
    addLine:  protectedProcedure.use(can('order.create')).input(AddLine).mutation(…),
    voidLine: protectedProcedure.use(can('order.void')).input(z.object({
      lineId: z.string(),
      reason: z.string().min(3),    // a reason is mandatory; it lands in the audit log
    })).mutation(…),
    discount: protectedProcedure.use(can('order.discount')).input(DiscountInput).mutation(…),
    fireKot:  protectedProcedure.use(can('order.create')).input(z.object({ orderId: z.string() })).mutation(…),
    settle:   protectedProcedure.use(can('order.create')).input(SettleInput).mutation(…),
    refund:   protectedProcedure.use(can('order.void')).input(RefundInput).mutation(…),
  }),

  kds:       router({ tickets: …, bump: …, recall: …, eightySix: … }),
  table:     router({ map: …, seat: …, move: …, merge: …, clear: …, reserve: … }),
  inventory: router({ stock: …, adjust: …, count: …, purchaseOrder: …, wastage: … }),
  customer:  router({ search: …, upsert: …, segment: …, campaign: … }),
  report:    router({ sales: …, items: …, channels: …, staff: …, tax: …, export: … }),
  staff:     router({ list: …, invite: …, setRole: …, setPin: …, revokeDevice: … }),
  billing:   router({ subscription: …, changePlan: …, invoices: …, paymentMethod: … }),

  // Platform-only. Guarded by a superadmin check, not by a tenant capability.
  platform:  router({ tenants: …, provision: …, suspend: …, impersonate: …, stats: … }),
});
```

### Capability middleware

```ts
const can = (capability: Capability) =>
  middleware(async ({ ctx, next }) => {
    if (!ctx.session) throw new TRPCError({ code: 'UNAUTHORIZED' });
    if (!ctx.capabilities.has(capability)) {
      throw new TRPCError({ code: 'FORBIDDEN', cause: 'FORBIDDEN_CAPABILITY' });
    }
    return next({ ctx });
  });
```

Hiding a button in the UI is a courtesy. This middleware is the control.

---

## 3. Device API (REST)

Used by POS terminals and kitchen displays, including while offline. Kept
separate from the internal API because the auth model, the idempotency
requirements and the failure behaviour all differ.

### 3.1 Device authentication

```http
POST /api/v1/device/pair
Content-Type: application/json

{ "pairingCode": "8F3K-2Q9X", "fingerprint": "d3b07…", "kind": "POS" }
```

```json
{
  "deviceId": "dev_1a2b",
  "deviceToken": "dvt_…",
  "tenantId": "t_adda",
  "outletId": "out_adda_main",
  "expiresAt": "2027-08-27T00:00:00+05:30"
}
```

A pairing code is generated in Settings and is valid for 10 minutes and one use.
The device token identifies the terminal, never a person.

```http
POST /api/v1/device/shift
Authorization: Bearer dvt_…

{ "membershipId": "mem_riya", "pin": "4821" }
```

Returns a short-lived `shiftToken` carrying the staff member's capabilities.
It expires at shift end or after 20 minutes idle. Both tokens are required on
every subsequent call:

```http
Authorization: Bearer dvt_…
X-Shift-Token: sft_…
```

Rate limit on PIN verification: 5 attempts per membership per 15 minutes, then
the membership locks and a manager is notified.

### 3.2 Menu snapshot for offline use

```http
GET /api/v1/device/menu?since=14
```

```json
{
  "version": 15,
  "publishedAt": "2026-08-27T19:20:00+05:30",
  "etag": "W/\"menu-15-adda\"",
  "categories": [ … ],
  "modifierGroups": [ … ],
  "stations": [ … ]
}
```

`304 Not Modified` when `since` matches the current version. The terminal caches
the payload in IndexedDB and bills from it while offline.

### 3.3 Event ingestion — the offline path

The single endpoint through which every POS mutation flows, online or replayed.

```http
POST /api/v1/device/events
Idempotency-Key: 01J9F2K8QW3RTYU6XZ0N4C7VBM

{
  "events": [
    {
      "id": "01J9F2K8QW3RTYU6XZ0N4C7VBM",
      "orderId": "ord_local_9f3a",
      "type": "order.created",
      "occurredAt": "2026-08-27T20:11:02+05:30",
      "payload": { "channel": "DINE_IN", "tableId": "T3", "guests": 2 }
    },
    {
      "id": "01J9F2K8R0A1B2C3D4E5F6G7H8",
      "orderId": "ord_local_9f3a",
      "type": "line.added",
      "occurredAt": "2026-08-27T20:11:09+05:30",
      "payload": {
        "lineId": "01J9F2K8R1…",
        "itemId": "itm_momo_chicken",
        "variantId": "steam",
        "qty": 2,
        "modifiers": [{ "id": "kadak", "pricePaise": 500 }],
        "menuVersion": 15
      }
    }
  ]
}
```

```json
{
  "accepted": ["01J9F2K8QW3RTYU6XZ0N4C7VBM", "01J9F2K8R0A1B2C3D4E5F6G7H8"],
  "duplicates": [],
  "rejected": [],
  "orders": [{ "localId": "ord_local_9f3a", "id": "ord_2497", "code": "ORD-2497", "seq": 88213 }]
}
```

Rules the client depends on:

1. **A batch is one transaction.** Either every event applies or none does.
2. **Events are ordered by `occurredAt`** within a batch, and the server rejects
   a batch whose events are out of order rather than silently reordering them.
3. **A duplicate id is success**, returned in `duplicates`. This is the whole
   point of the design — a terminal that retries after a timeout must not double
   an order.
4. **A rejected event carries a `code` and does not block the batch's successors
   in a later retry**, so one bad line cannot wedge the queue forever. Rejections
   surface to a manager for resolution.
5. **`menuVersion` on each line** lets the server detect that a terminal billed
   against a stale menu and respond with `STALE_MENU_VERSION` plus the correct
   price, rather than accepting the wrong amount.

### 3.4 KDS

```http
GET /api/v1/device/kds/tickets?stationId=st_wok
POST /api/v1/device/kds/bump      { "orderId": "ord_2491", "lineIds": ["…"] }
POST /api/v1/device/kds/recall    { "orderId": "ord_2491" }
POST /api/v1/device/kds/86        { "itemId": "itm_spring_potato", "reason": "Spirals finished" }
```

`GET tickets` is the polling fallback used only when the WebSocket is down; the
normal path is the subscription in §4.

---

## 4. Realtime (WebSocket)

```
wss://rt.restros.in/v1?token={shiftToken|deviceToken}
```

### Subscribe

```json
{ "op": "subscribe", "channels": ["tenant:t_adda:outlet:out_adda_main:kds"] }
```

The gateway verifies the token's tenant and outlet against the requested
channel before joining. A client cannot subscribe its way into another tenant —
a mismatch closes the socket with code `4403`.

### Server events

```json
{
  "op": "event",
  "seq": 88214,
  "channel": "tenant:t_adda:outlet:out_adda_main:kds",
  "type": "kot.fired",
  "at": "2026-08-27T20:11:12+05:30",
  "data": {
    "orderId": "ord_2497",
    "kotCode": "K0497",
    "table": "T3",
    "targetMins": 13,
    "lines": [{ "qty": 2, "name": "Momo · Steam", "stationId": "st_fry", "modifiers": ["Kadak"] }]
  }
}
```

| Type | Channel | Consumers |
| --- | --- | --- |
| `kot.fired` | `:kds` | Kitchen displays |
| `line.ready` / `ticket.bumped` | `:kds`, `:pos` | KDS, POS, table map |
| `item.eightysixed` | `:menu` | POS, guest menu, aggregator worker |
| `menu.published` | `:menu` | Every terminal (triggers a snapshot refresh) |
| `order.settled` | `:pos` | Table map, dashboard |
| `table.changed` | `:floor` | Host stand, manager console |

### Client obligations

- Heartbeat `{"op":"ping"}` every 20s; the gateway closes a silent socket at 60s.
- Track `seq` per channel. **A gap means refetch**, not patch — reconstructing
  state from a partial stream is how kitchen displays end up lying.
- Reconnect with exponential backoff and jitter, capped at 30s.
- After 10s without a socket, fall back to polling and show the degraded badge.

---

## 5. Public API (Scale plan)

```http
Authorization: Bearer rk_live_…
```

Keys are tenant-scoped with explicit scopes (`orders:read`, `menu:write`,
`reports:read`). Rate limit: 120 requests/minute, burst 20.

| Method | Path | Scope |
| --- | --- | --- |
| `GET` | `/api/v1/public/menu` | `menu:read` |
| `PATCH` | `/api/v1/public/items/{id}` | `menu:write` |
| `GET` | `/api/v1/public/orders?from=&to=&cursor=` | `orders:read` |
| `GET` | `/api/v1/public/orders/{id}` | `orders:read` |
| `POST` | `/api/v1/public/orders` | `orders:write` |
| `GET` | `/api/v1/public/reports/daily?from=&to=` | `reports:read` |

### Webhooks

Registered per tenant. Delivered at least once, with retries at 1s, 10s, 1m,
10m, 1h, then dead-lettered.

```http
POST https://tenant.example.com/hooks/restros
X-RestrOS-Event: order.settled
X-RestrOS-Delivery: 01J9F2…
X-RestrOS-Signature: t=1756312272,v1=5257a869e7…
```

Signature is `HMAC-SHA256(secret, "{timestamp}.{rawBody}")`. Consumers must
**compare in constant time** and **reject a timestamp older than five minutes**
to prevent replay.

Events: `order.created`, `order.settled`, `order.cancelled`, `menu.published`,
`item.eightysixed`, `stock.low`, `shift.closed`.

---

## 6. Aggregator integration

Swiggy and Zomato sit behind one internal interface, so a third platform is an
adapter rather than a rewrite.

```ts
interface AggregatorAdapter {
  pushMenu(tenantId: string, version: MenuVersion): Promise<PushResult>;
  setAvailability(tenantId: string, itemId: string, available: boolean): Promise<void>;
  normaliseOrder(raw: unknown): NormalisedOrder;   // → the same shape as a POS order
  acknowledge(externalId: string, status: 'accepted' | 'rejected', minutes?: number): Promise<void>;
}
```

Inbound orders are normalised into the same `Order` shape as dine-in, with
`channel = SWIGGY | ZOMATO`, `externalRef` set, and `commissionPaise` computed
from the tenant's contracted rate. They appear on the KDS indistinguishably
from a walk-in ticket — deliberately, because the kitchen should not have to
care where an order came from.

`UNIQUE (tenantId, channel, externalRef)` makes a redelivered aggregator webhook
a no-op.

---

## 7. Versioning

- The URL carries the major version (`/api/v1`). A breaking change means `/v2`.
- Additive changes ship without a version bump; clients must ignore unknown
  fields.
- Deprecation: `Sunset` header plus 90 days' notice for the public API, and a
  banner in the console for anything a tenant is actively using.
- The internal tRPC surface is versionless — it deploys with its only consumer.
- The **device API is the exception**: terminals may be offline for days and
  cannot be forced to upgrade mid-service, so `/v1` device endpoints are
  supported for **12 months** past deprecation, minimum.
