/**
 * Ledger — Drizzle schema (Postgres twin).
 *
 * Exists only to drive `drizzle-kit generate --dialect postgresql`.
 * Application code never imports this file — see `schema.ts`, the file
 * that's structurally identical and actually queried on both dialects, and
 * whose header comment documents the `tenant_id` (platform-required,
 * constant in v1) vs. `user_id` (the real per-user scoping column)
 * distinction that every table and index below follows.
 *
 * Diffs from `schema.ts`, per this app family's established rule
 * (docs/plugin-database.md): every **timestamp** column (`created_at`,
 * `updated_at`, `occurred_at`, `reviewed_at`) is `bigint({ mode: 'number' })`,
 * never plain `integer` — Postgres `integer` is a real, fixed 32-bit type,
 * and a 13-digit Unix-ms value is already ~800x past that limit. Every
 * *other* integer column (money in minor units, `year`/`month`,
 * `recurrence_interval_count`, `is_base`) stays plain `integer` — a
 * personal budget's amounts have no realistic path to overflowing 32 bits
 * of cents (~$21M), unlike a millisecond timestamp, which always does.
 * `real` becomes `doublePrecision` (the one non-integer numeric column,
 * `fxRates.rate`). Indexes are mirrored 1:1 with `schema.ts`.
 */
import {
  bigint,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const currencies = pgTable(
  'ledger_currencies',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    code: text('code').notNull(),
    isBase: integer('is_base').notNull().default(0),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (t) => [index('ledger_currencies_user_code_idx').on(t.userId, t.code)],
);

export const fxRates = pgTable(
  'ledger_fx_rates',
  {
    id: text('id').primaryKey(),
    currencyCode: text('currency_code').notNull(),
    pivotCode: text('pivot_code').notNull(),
    rate: doublePrecision('rate').notNull(),
    asOfDate: text('as_of_date').notNull(),
    source: text('source'),
  },
  (t) => [
    uniqueIndex('ledger_fx_rates_lookup_idx').on(t.currencyCode, t.pivotCode, t.asOfDate),
  ],
);

export const incomes = pgTable(
  'ledger_incomes',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    label: text('label').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    kind: text('kind').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (t) => [index('ledger_incomes_user_idx').on(t.userId)],
);

export const categories = pgTable(
  'ledger_categories',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (t) => [index('ledger_categories_user_idx').on(t.userId)],
);

export const kinds = pgTable(
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
    recurrenceIntervalUnit: text('recurrence_interval_unit'),
    recurrenceIntervalCount: integer('recurrence_interval_count'),
    recurrenceAnchorDate: text('recurrence_anchor_date'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (t) => [index('ledger_kinds_category_idx').on(t.categoryId)],
);

export const transactions = pgTable(
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
    occurredAt: bigint('occurred_at', { mode: 'number' }).notNull(),
    note: text('note'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (t) => [
    index('ledger_transactions_user_kind_occurred_idx').on(t.userId, t.kindId, t.occurredAt),
  ],
);

export const savingJars = pgTable(
  'ledger_saving_jars',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    kindId: text('kind_id')
      .notNull()
      .unique()
      .references(() => kinds.id, { onDelete: 'cascade' }),
    balanceMinor: integer('balance_minor').notNull().default(0),
    currency: text('currency').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (t) => [index('ledger_saving_jars_user_idx').on(t.userId)],
);

export const jarTransactions = pgTable(
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
    occurredAt: bigint('occurred_at', { mode: 'number' }).notNull(),
  },
  (t) => [
    index('ledger_jar_transactions_user_jar_occurred_idx').on(t.userId, t.jarId, t.occurredAt),
  ],
);

export const accounts = pgTable(
  'ledger_accounts',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    institution: text('institution'),
    type: text('type').notNull(),
    balanceMinor: integer('balance_minor').notNull(),
    currency: text('currency').notNull(),
    creditLimitMinor: integer('credit_limit_minor'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (t) => [index('ledger_accounts_user_idx').on(t.userId)],
);

export const assets = pgTable(
  'ledger_assets',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    valueMinor: integer('value_minor').notNull(),
    currency: text('currency').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (t) => [index('ledger_assets_user_idx').on(t.userId)],
);

export const deposits = pgTable(
  'ledger_deposits',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (t) => [index('ledger_deposits_user_idx').on(t.userId)],
);

export const loans = pgTable(
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
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    linkedKindId: text('linked_kind_id')
      .notNull()
      .unique()
      .references(() => kinds.id),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (t) => [index('ledger_loans_user_idx').on(t.userId)],
);

export const people = pgTable(
  'ledger_people',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    balanceMinor: integer('balance_minor').notNull().default(0),
    currency: text('currency').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (t) => [index('ledger_people_user_idx').on(t.userId)],
);

export const peopleTransactions = pgTable(
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
    occurredAt: bigint('occurred_at', { mode: 'number' }).notNull(),
  },
  (t) => [
    index('ledger_people_transactions_user_person_occurred_idx').on(
      t.userId,
      t.personId,
      t.occurredAt,
    ),
  ],
);

export const periodReviews = pgTable(
  'ledger_period_reviews',
  {
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    reviewedAt: bigint('reviewed_at', { mode: 'number' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.year, t.month] })],
);

export const monthEndNotifications = pgTable(
  'ledger_month_end_notifications',
  {
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    sentAt: bigint('sent_at', { mode: 'number' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.year, t.month] })],
);
