/**
 * Ledger — Drizzle schema (SQLite).
 *
 * Application code queries through this file on both dialects — the query
 * builder is bound to the client connection, not the table object. The
 * Postgres twin (`schema.postgres.ts`) exists only to drive
 * `drizzle-kit generate --dialect postgresql`; keep the two structurally
 * identical, and keep Postgres column types serialization-compatible with
 * these (plain integer for booleans/timestamps — never native
 * boolean/bigint on the SQLite side). See docs/plugin-database.md.
 *
 * Conventions:
 * - ids are caller-generated text (nanoid).
 * - `tenant_id` on every user-scoped table — a platform-required,
 *   multi-tenancy-readiness column, constant across this v1 single-tenant
 *   instance. It is NOT the per-user scoping field — see `user_id` below —
 *   except on `ledger_fx_rates`, which has neither: exchange rates are
 *   public, instance-wide data.
 * - `user_id` (= the session's actual user id, `Actor.userId` in the data
 *   layer) is the real per-user ownership column on every table above.
 *   Every "per-user" index/constraint is keyed on this, never `tenant_id`
 *   alone — `tenant_id` is constant in v1, so an index keyed on it alone
 *   would silently span every user on the instance.
 * - Datetime fields (`created_at`, `updated_at`, `occurred_at`, `reviewed_at`)
 *   are Unix milliseconds (integer). Date-only fields (`as_of_date`,
 *   `start_date`, `end_date`, `recurrence_anchor_date`) are `YYYY-MM-DD`
 *   text — a calendar day has no timezone-dependent instant, so an integer
 *   timestamp would be the wrong representation for them.
 * - Monetary amounts are integer minor units (e.g. cents), never float —
 *   `amountMinor`/`balanceMinor`/etc. A `real` exchange `rate` is the one
 *   deliberate exception: it's a ratio, not money, and needs more precision
 *   than two decimal places.
 * - "Enums" (`kind`, `type`, `direction`-shaped columns) are plain `text`,
 *   enforced in the data layer, not the schema — matching this app family's
 *   existing convention (see `sovereign-plugin-kanban.local`'s schema.ts).
 */
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const currencies = sqliteTable(
  'ledger_currencies',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    /** ISO 4217-shaped code, e.g. 'EUR'. Not validated against a real ISO list in Phase 1. */
    code: text('code').notNull(),
    /** 0 | 1 — the budget's reporting/rollup currency. Exactly one per user, enforced in the data layer. */
    isBase: integer('is_base').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('ledger_currencies_user_code_idx').on(t.userId, t.code)],
);

/**
 * UNTENANTED — exchange rates are public, instance-wide data, not
 * per-user (no `tenant_id`/`user_id` at all). Every currency's rate is
 * stored against one pivot currency (see CONCEPT.md/SPEC.md) rather than
 * every pairwise combination; a cross-rate is derived at query time. The
 * unique index below is both the idempotency guard `fetch-fx-rates.ts`
 * (L.10) relies on via `onConflictDoNothing` and the "rate in effect as of
 * a given date" lookup shape (see `fx-rates.ts`) — one index does both
 * jobs.
 */
export const fxRates = sqliteTable(
  'ledger_fx_rates',
  {
    id: text('id').primaryKey(),
    currencyCode: text('currency_code').notNull(),
    pivotCode: text('pivot_code').notNull(),
    rate: real('rate').notNull(),
    /** Date-only, `YYYY-MM-DD`. */
    asOfDate: text('as_of_date').notNull(),
    /** Provenance of the rate (e.g. 'frankfurter', 'coingecko'). Nullable — not always known. */
    source: text('source'),
  },
  (t) => [
    uniqueIndex('ledger_fx_rates_lookup_idx').on(t.currencyCode, t.pivotCode, t.asOfDate),
  ],
);

export const incomes = sqliteTable(
  'ledger_incomes',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    label: text('label').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    /** 'primary' | 'secondary' — enforced in the data layer. */
    kind: text('kind').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('ledger_incomes_user_idx').on(t.userId)],
);

export const categories = sqliteTable(
  'ledger_categories',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    /** 'dynamic' | 'fixed' | 'saving' — enforced in the data layer. */
    type: text('type').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('ledger_categories_user_idx').on(t.userId)],
);

export const kinds = sqliteTable(
  'ledger_kinds',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    predictedAmountMinor: integer('predicted_amount_minor').notNull(),
    currency: text('currency').notNull(),
    /**
     * Fixed-type kinds only; null for dynamic/saving. 'day' | 'week' |
     * 'month' | 'year', enforced in the data layer.
     */
    recurrenceIntervalUnit: text('recurrence_interval_unit'),
    recurrenceIntervalCount: integer('recurrence_interval_count'),
    /** Date-only, `YYYY-MM-DD`. Fixed-type kinds only. */
    recurrenceAnchorDate: text('recurrence_anchor_date'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('ledger_kinds_category_idx').on(t.categoryId)],
);

/**
 * Dynamic + Fixed actuals only — see SPEC.md's Data model correction #3: a
 * jar-funded expense is never a row here, only in `jarTransactions`.
 * `amountMinor` is always a positive spend magnitude (unlike the jar/people
 * transaction tables, which are signed deltas) — a transaction here always
 * represents money actually spent against a budgeted kind.
 */
export const transactions = sqliteTable(
  'ledger_transactions',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    kindId: text('kind_id')
      .notNull()
      .references(() => kinds.id, { onDelete: 'cascade' }),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    occurredAt: integer('occurred_at').notNull(),
    note: text('note'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('ledger_transactions_user_kind_occurred_idx').on(t.userId, t.kindId, t.occurredAt)],
);

export const savingJars = sqliteTable(
  'ledger_saving_jars',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    /** One jar per saving-type kind — created together (see L.12). */
    kindId: text('kind_id')
      .notNull()
      .unique()
      .references(() => kinds.id, { onDelete: 'cascade' }),
    /** Cached running balance — source of truth is the sum of `jarTransactions`, kept in sync transactionally on every insert. */
    balanceMinor: integer('balance_minor').notNull().default(0),
    currency: text('currency').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('ledger_saving_jars_user_idx').on(t.userId)],
);

/**
 * Signed amount: positive = contribution, negative = withdrawal — not a
 * direction enum plus an always-positive magnitude (see SPEC.md's Data
 * model notes). `categoryId` is carried (nullable) purely so a jar-funded
 * expense still renders correctly in a "recent activity" feed.
 */
export const jarTransactions = sqliteTable(
  'ledger_jar_transactions',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    jarId: text('jar_id')
      .notNull()
      .references(() => savingJars.id, { onDelete: 'cascade' }),
    amountMinor: integer('amount_minor').notNull(),
    categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
    note: text('note'),
    occurredAt: integer('occurred_at').notNull(),
  },
  (t) => [index('ledger_jar_transactions_user_jar_occurred_idx').on(t.userId, t.jarId, t.occurredAt)],
);

export const accounts = sqliteTable(
  'ledger_accounts',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    /** An identifier the user picks — never a real account number. */
    name: text('name').notNull(),
    institution: text('institution'),
    /** 'bank' | 'credit_card' — enforced in the data layer. */
    type: text('type').notNull(),
    balanceMinor: integer('balance_minor').notNull(),
    currency: text('currency').notNull(),
    /** Credit cards only. */
    creditLimitMinor: integer('credit_limit_minor'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('ledger_accounts_user_idx').on(t.userId)],
);

export const assets = sqliteTable(
  'ledger_assets',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    /** 'physical' | 'security' — enforced in the data layer. */
    type: text('type').notNull(),
    valueMinor: integer('value_minor').notNull(),
    currency: text('currency').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('ledger_assets_user_idx').on(t.userId)],
);

export const deposits = sqliteTable(
  'ledger_deposits',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('ledger_deposits_user_idx').on(t.userId)],
);

export const loans = sqliteTable(
  'ledger_loans',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    lender: text('lender').notNull(),
    principalMinor: integer('principal_minor').notNull(),
    remainingBalanceMinor: integer('remaining_balance_minor').notNull(),
    installmentAmountMinor: integer('installment_amount_minor').notNull(),
    currency: text('currency').notNull(),
    /** Date-only, `YYYY-MM-DD`. */
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    /**
     * The auto-generated Fixed kind for this loan's installment — created
     * together (see L.7). 1:1, so deleting the loan must explicitly delete
     * this kind too in the same action transaction; the FK direction here
     * (loan references kind) can't express that cascade automatically.
     */
    linkedKindId: text('linked_kind_id')
      .notNull()
      .unique()
      .references(() => kinds.id),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('ledger_loans_user_idx').on(t.userId)],
);

export const people = sqliteTable(
  'ledger_people',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    /** Cached, signed (positive = they owe the user). Source of truth is the sum of `peopleTransactions`. */
    balanceMinor: integer('balance_minor').notNull().default(0),
    currency: text('currency').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('ledger_people_user_idx').on(t.userId)],
);

/** Signed delta — positive increases what they owe the user, negative decreases it (or reverses past a payment). */
export const peopleTransactions = sqliteTable(
  'ledger_people_transactions',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    amountMinor: integer('amount_minor').notNull(),
    note: text('note'),
    occurredAt: integer('occurred_at').notNull(),
  },
  (t) => [
    index('ledger_people_transactions_user_person_occurred_idx').on(
      t.userId,
      t.personId,
      t.occurredAt,
    ),
  ],
);

/**
 * Rows exist ONLY for reviewed periods — no nullable `reviewed_at` on a
 * pre-populated per-period row, no backfill job. "Needs review" is simply
 * the absence of a row for a past `(user_id, year, month)`. `tenant_id` is
 * still carried (platform convention) but deliberately not part of the
 * primary key on its own — it's constant in v1, so a key without `user_id`
 * would collide across every user on the instance.
 */
export const periodReviews = sqliteTable(
  'ledger_period_reviews',
  {
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    reviewedAt: integer('reviewed_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.year, t.month] })],
);

/**
 * L.10's "already sent" marker for `app/_jobs/month-end-report.ts` (L.11) —
 * deliberately a separate table from `periodReviews` above, not a column
 * added to it: that table's own "absence of a row = needs review" invariant
 * (its own doc comment) would break if a row could also exist for a period
 * that was auto-notified but never user-reviewed. The insert into this
 * table via `onConflictDoNothing` IS the idempotency claim — a row landing
 * is what licenses the job to actually send; this is a cross-replica
 * coordination primitive (each replica of a multi-node deployment ticks
 * independently — the schedule docs' own note), not just a same-process
 * dedup guard.
 */
export const monthEndNotifications = sqliteTable(
  'ledger_month_end_notifications',
  {
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    sentAt: integer('sent_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.year, t.month] })],
);
