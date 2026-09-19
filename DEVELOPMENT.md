# Development Rules

## General principle

Write code as if another developer will maintain it for years.

Prefer:

``` text
simple
clear
boring
predictable
```

over:

``` text
clever
abstract
generic
over-engineered
```

## Naming

Use simple names.

Good:

``` text
products
sales
purchases
stock
customers
suppliers
```

Avoid unnecessarily complicated names such as:

``` text
ProductAggregateManager
InventoryDomainOrchestrator
AbstractProductRepositoryFactory
```

## Functions

Prefer small functions with one clear responsibility.

## Database

All schema changes must use SQLx migrations.

Never manually change production database structure.

## Errors

Return useful errors to the frontend.

Example:

``` text
Cannot complete sale:
Product "Stylo Bleu" only has 2 units in stock.
```

Do not expose raw Rust/SQL errors to the user.

## Validation

Validate important business rules in Rust/database-side logic, not only
in React.

Frontend validation is for UX.

Backend validation is for correctness.

## Stock

Never change product stock without a corresponding stock movement.

Purchases and sales must use database transactions.

## Product deletion

Do not delete products with historical transactions.

Deactivate them instead.

## UI

The application should feel like a professional POS:

-   fast
-   clean
-   minimal clicks
-   readable tables
-   clear totals
-   keyboard-friendly
-   barcode-first POS

Avoid unnecessary animations.

## Performance

The application should remain lightweight.

Avoid:

-   huge dependencies
-   unnecessary polling
-   unnecessary global state
-   loading entire tables when pagination/filtering can be used
-   expensive re-renders

Barcode lookup should feel immediate.

## Security

-   never store plain-text passwords
-   validate Tauri command inputs
-   use parameterized SQL through SQLx
-   do not expose arbitrary filesystem access to the frontend
-   keep database in the OS application-data directory
-   do not put secrets in the frontend bundle

## Backups

The database must be easy to back up.

A simple backup should copy the SQLite database safely.

Do not implement cloud synchronization in V1.

## Testing

Focus testing on business-critical operations:

1.  product creation
2.  purchase increases stock
3.  sale decreases stock
4.  sale cannot exceed stock
5.  stock adjustment creates movement
6.  cancelled operations do not corrupt stock
7.  profit calculation remains correct after product purchase price
    changes

Do not create an enormous testing framework.

Use straightforward unit/integration tests for the critical business
logic.
