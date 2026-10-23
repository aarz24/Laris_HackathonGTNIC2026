---
kind: business_term
name: Business Glossary
category: business_term
scope:
    - '**'
---

### Laris
- Definition：Internal product name of the GTNIC hackathon project — a workspace-operational system for Indonesian F&B micro/small businesses that connects business accounts, POS, inventory, purchases, customers, financial reports, team management, and an AI assistant.

### Kopi Senja
- Definition：Fictional coffee shop whose catalog and data seed the local `/demo` mode; changes in demo mode persist only in that browser and are not real transactions.

### mode lokal
- Definition：Local/demo runtime where the app stores state in the browser instead of connecting to Supabase; always explicit and never silently used as a fallback after cloud failure.
- Aliases：local mode

### cloud mode
- Definition：Runtime where Supabase is configured; enables persistent business accounts, tenant-isolated data, and cloud features like checkout RPCs and OCR.

### Tanya Laris
- Definition：Workspace-aware AI assistant feature that answers questions over the active business's catalog, inventory, and snapshot state; distinct from the standalone parse-order and scan-receipt endpoints.

### HPP
- Definition：Indonesian accounting term for Cost of Goods Sold (Harga Pokok Penjualan); computed server-side using moving-average cost aggregation across recipes, stock movements, and purchases.
- Aliases：COGS

### stok opname
- Definition：Inventory count/stocktake workflow that reconciles physical stock against the ledger; part of the production-hardened migration set.

### cekatan
- Definition：Indonesian POS shorthand for cash payment; mapped to the internal payment method 'cash' alongside 'qris' and 'transfer'.
- Aliases：cash

### ceban / goceng / gocap / cepek
- Definition：Indonesian coffee-shop slang for fixed topping surcharges: ceban = Rp10,000, goceng = Rp5,000, gocap = Rp50,000, cepek = Rp100,000; recognized by the AI parser as price modifiers.

### less sugar / no sugar / less ice / no ice
- Definition：Bilingual instruction tokens the AI parser maps into standardized notes ('less sugar', 'no sugar', 'less ice', 'no ice') so Indonesian orders like 'kurang manis' and 'tanpa es' resolve consistently.
- Aliases：kurang manis、tanpa gula、sedikit es、tanpa es

### GTNC 2026
- Definition：Hackathon event context (Global Tech Network Challenge 2026) under which Laris was built; appears in repository metadata and PRD filenames.
