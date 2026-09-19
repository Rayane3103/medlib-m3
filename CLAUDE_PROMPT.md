# Claude Initialisation Prompt

You are a senior desktop full-stack engineer.

I want you to initialize a real production-quality but intentionally
simple Windows desktop application called **MyStore**.

It is a management/POS application for my own Algerian retail store. The
store sells school supplies, stationery, and cosmetics.

I am already an experienced full-stack developer. Do not treat me as a
beginner and do not generate complicated architecture just to appear
professional.

The most important requirements are:

-   Windows installable desktop application
-   very low RAM/resource usage
-   local-first
-   works without Internet
-   fast barcode scanning
-   simple and professional UI
-   reliable stock management
-   easy backup
-   easy maintenance
-   clean source code

## Technology

Use exactly this initial stack:

-   Tauri 2
-   React
-   TypeScript
-   Vite
-   Tailwind CSS
-   shadcn/ui
-   SQLite
-   Rust
-   SQLx
-   SQLx migrations

Do NOT use Electron.

Do NOT create FastAPI, Node backend, PostgreSQL, Docker, Redis, or
microservices for V1.

## Architecture

Use:

``` text
React UI
   |
Tauri invoke
   |
Rust commands
   |
SQLx
   |
SQLite
```

Keep the Rust layer small and understandable.

React handles the interface.

Rust handles database operations, transactions, filesystem operations,
and business operations that need to be protected from the UI.

## Read the project documentation first

Before writing code, read these files:

-   README.md
-   ARCHITECTURE.md
-   DATABASE.md
-   FEATURES.md
-   DEVELOPMENT.md

They are the source of truth for this project.

## Project initialization

First initialize only the foundation:

1.  Tauri 2 project
2.  React + TypeScript + Vite
3.  Tailwind
4.  shadcn/ui
5.  SQLite connection
6.  SQLx
7.  migrations
8.  database models/queries
9.  basic Tauri commands
10. basic application layout
11. navigation
12. a simple Dashboard placeholder
13. development README

Do NOT implement all features in the first step.

After initialization, stop and report:

-   files created
-   technologies installed
-   commands to run the project
-   database setup
-   what is working
-   what remains

## Code style

Keep code human-written and simple.

Avoid:

-   excessive classes
-   generic abstractions
-   repository pattern everywhere
-   service layers for trivial operations
-   dependency injection frameworks
-   complex state management
-   unnecessary custom hooks
-   huge files
-   huge components
-   magic utilities
-   unnecessary design patterns

Use simple functions and modules.

## Database

Use the schema described in DATABASE.md.

The first migration should create:

-   users
-   categories
-   products
-   suppliers
-   customers
-   purchases
-   purchase_items
-   sales
-   sale_items
-   stock_movements
-   expenses

Add appropriate foreign keys and indexes.

Barcode must have a unique index when present.

## Business rules

These rules are critical.

### Purchase

When a purchase is completed:

``` text
create purchase
create purchase items
increase product stock
create PURCHASE stock movements
```

All operations must happen in one SQLite transaction.

### Sale

When a sale is completed:

``` text
create sale
create sale items
decrease product stock
create SALE stock movements
```

All operations must happen in one SQLite transaction.

Do not allow stock to become negative.

### Historical purchase price

When creating sale_items, store the product purchase price at that
moment.

Do not calculate historical profit using the current product purchase
price.

### Stock

Every stock change must create a stock movement.

## Barcode

Assume the barcode scanner behaves like a keyboard.

The POS should have a focused barcode input.

A scanned barcode should:

``` text
scan
→ input
→ lookup product
→ add to cart
```

Do not add complicated hardware integration.

## UI direction

Make the UI look like a real professional desktop POS.

Use a clean sidebar:

``` text
Dashboard
POS
Products
Stock
Purchases
Suppliers
Customers
Reports
Expenses
Settings
```

Prioritize:

-   speed
-   readability
-   keyboard usage
-   clear buttons
-   clear totals
-   tables
-   search
-   filters

Do not add excessive animations.

## Development order

After initialization, implement features in this exact order:

### Step 1

Products + Categories

### Step 2

Stock + Stock movements

### Step 3

Suppliers + Purchases

### Step 4

POS + Sales + Barcode

### Step 5

Customers

### Step 6

Dashboard + Reports

### Step 7

Expenses

### Step 8

Authentication + user roles

### Step 9

Backup/restore

### Step 10

Windows packaging and installer

After each major step, keep the application runnable.

## Important

Do not invent requirements.

Do not add future features from your own imagination.

If something is not specified, choose the simplest reasonable
implementation.

If there are two technically valid solutions, choose the one with:

1.  fewer dependencies
2.  less RAM
3.  less code
4.  easier maintenance
5.  better reliability

The goal is not to build an impressive architecture.

The goal is to build a **small, fast, reliable, professional
store-management application that I can actually install and use every
day.**
