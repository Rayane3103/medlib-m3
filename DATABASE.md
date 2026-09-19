# Database Design

Use SQLite with SQLx migrations.

Keep the schema small and explicit.

## Tables

### users

``` text
id
name
username
password_hash
role
active
created_at
updated_at
```

Roles for V1:

``` text
ADMIN
CASHIER
```

### categories

``` text
id
name
active
created_at
```

Examples:

``` text
Cosmétiques
Affaires scolaires
```

### products

``` text
id
barcode
name
category_id
brand
purchase_price
selling_price
stock
active
created_at
updated_at
```

Rules:

-   barcode should be unique when present
-   selling price must not be negative
-   purchase price must not be negative
-   stock should normally not be negative
-   product can be deactivated instead of deleted when it has historical
    sales

### customers

``` text
id
name
phone
notes
active
created_at
updated_at
```

A sale may have no customer.

### purchases

``` text
id
total
status
purchase_date
notes
created_at
```

V1 purchase status can be:

``` text
COMPLETED
CANCELLED
```

### purchase_items

``` text
id
purchase_id
product_id
quantity
unit_price
total
```

### sales

``` text
id
customer_id
total
payment_method
status
sale_date
created_at
```

Payment methods:

``` text
CASH
CARD
OTHER
```

Keep the list easy to extend.

Sale status:

``` text
COMPLETED
CANCELLED
```

### sale_items

``` text
id
sale_id
product_id
quantity
unit_price
purchase_price
total
```

Important:

`purchase_price` must be copied into the sale item at the time of sale.

This preserves historical profit calculations when the product purchase
price changes later.

### stock_movements

``` text
id
product_id
type
quantity
reference_type
reference_id
note
created_at
```

Types:

``` text
PURCHASE
SALE
RETURN
DAMAGE
ADJUSTMENT
```

For example:

``` text
PURCHASE +50
SALE -2
DAMAGE -1
RETURN +1
ADJUSTMENT +5
```

### expenses

``` text
id
name
amount
expense_date
notes
created_at
```

## Relationships

``` text
categories
    |
    +---- products
              |
              +---- sale_items ---- sales ---- customers
              |
              +---- purchase_items ---- purchases
              |
              +---- stock_movements
```

## Indexes

At minimum:

-   products.barcode
-   products.name
-   products.category_id
-   stock_movements.product_id
-   sales.sale_date
-   purchases.purchase_date

Barcode lookup must be fast.

## Money

Do not use floating-point numbers for money.

Use integer values representing the smallest practical unit, or a
precise decimal strategy supported consistently by SQLite/SQLx.

For Algerian dinar values, an integer number of DA is sufficient for V1
unless decimal pricing is actually required.

## Deletion

Avoid hard deleting products, customers, sales, and purchases that are
referenced by historical data.

Prefer:

``` text
active = false
```

or cancellation status where appropriate.

## Auditability

Every stock change must create a `stock_movements` record.

Never silently modify stock without recording why it changed.
