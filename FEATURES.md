# Features

## V1 --- Must have

### Authentication

-   Login screen
-   ADMIN role
-   CASHIER role
-   Logout
-   Password stored as a secure hash

### Dashboard

Show:

-   today's sales
-   today's number of sales
-   estimated profit
-   recent sales

Keep the dashboard simple.

### Products

-   create product
-   edit product
-   deactivate product
-   search product
-   search by barcode
-   filter by category
-   product details
-   purchase price
-   selling price
-   current stock (set directly when creating a product; changes after
    that go through Purchases or Stock)
-   brand

### POS

The POS is the most important screen.

Support:

-   barcode scanning (USB/keyboard-wedge scanner)
-   scan with a phone camera instead, over the local network, via a QR code
    shown on this screen (no separate scanner hardware required)
-   product search
-   add product to cart
-   change quantity
-   remove item
-   clear cart
-   calculate subtotal
-   calculate total
-   optional customer
-   complete sale
-   sale confirmation
-   printable/simple receipt later

Keyboard-first behavior is preferred.

### Purchases

-   create purchase
-   add products
-   quantities
-   purchase prices
-   calculate total
-   complete purchase
-   automatically increase stock
-   create stock movement

### Stock

-   current stock
-   stock adjustment
-   stock movement history
-   movement reason
-   product stock history

### Customers

-   create
-   edit
-   deactivate
-   search
-   view sales history

### Reports

V1 reports:

-   sales today
-   sales by date range
-   purchases by date range
-   estimated profit
-   best-selling products
-   expenses
-   simple daily sales summary

### Expenses

-   add expense
-   edit expense
-   delete expense if not finalized
-   list expenses
-   date filtering

### Settings

-   store name
-   store address
-   phone
-   currency
-   receipt settings
-   database backup
-   database restore
-   user management for ADMIN

------------------------------------------------------------------------

# V1.1 --- Later

Only implement after V1 is stable:

-   printable thermal receipts
-   product images
-   CSV import/export
-   CSV backup
-   barcode label printing
-   customer debt/credit
-   returns
-   discounts
-   profit analytics
-   keyboard shortcuts
-   automatic database backup

# Future

Possible later features:


-   PostgreSQL
-   cloud backup
-   mobile companion app
-   online store synchronization


Do not implement future features now.

------------------------------------------------------------------------

# Explicitly out of scope

-   full accounting ERP
-   payroll
-   HR
-   manufacturing
-   CRM
-   e-commerce
-   AI features
-   loyalty system
-   complex promotions
-   multi-company
-   multi-country
-   complex warehouse management
-   minimum-stock thresholds / low-stock alerts (removed by request - not
    wanted for this store)
