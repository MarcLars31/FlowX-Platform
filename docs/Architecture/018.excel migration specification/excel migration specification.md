---

document_id: 020
title: Excel Migration Specification
version: 1.0
status: Draft
classification: Internal
owner: Founder
repository: flowx-platform
last_updated: 2026-06-28
review_cycle: Continuous
depends_on:

* 007-engineering-knowledge-model.md
* 008-rule-execution-engine.md
* 009-calculation-engine.md
* 011-engineering-pipeline.md
* 016-canonical-data-model.md
  related_documents:
* 017-postgresql-schema-specification.md
  related_adrs: []

---

# FlowX Excel Migration Specification

> The Excel workbook is the reference implementation of the first engineering domain. The purpose of this specification is to migrate engineering knowledge into FlowX without losing correctness, traceability or maintainability.

---

# 1. Purpose

The objective of this migration is **not** to recreate Excel.

The objective is to extract engineering knowledge from Excel and represent it within the FlowX architecture.

When migration is complete:

* Excel is no longer required for engineering calculations.
* FlowX becomes the authoritative engineering platform.
* Engineering knowledge is structured, versioned and testable.

---

# 2. Migration Principles

The migration shall follow these principles:

* Knowledge before code.
* Rules before implementation.
* Validation before replacement.
* One source of truth.
* No loss of engineering behaviour.
* Full traceability.

---

# 3. Excel as Reference

Until migration is complete, Excel is considered the official reference implementation.

FlowX must produce identical engineering results for all validated scenarios.

Excel shall never be modified to match FlowX.

FlowX shall be corrected until it matches the verified engineering behaviour of Excel.

---

# 4. Migration Strategy

Migration shall occur incrementally.

Each worksheet is migrated independently.

Each completed worksheet shall be fully validated before continuing.

Migration order:

1. Inputs
2. Reference tables
3. Engineering rules
4. Formulas
5. Product mappings
6. Outputs
7. Reports

---

# 5. Worksheet Inventory

Every worksheet shall be documented.

For each worksheet record:

* Worksheet name
* Business purpose
* Inputs
* Outputs
* Dependencies
* Hidden cells
* Named ranges
* External references
* VBA dependencies
* Comments

No worksheet shall be migrated before it has been documented.

---

# 6. Formula Inventory

Every Excel formula shall be catalogued.

For each formula record:

* Formula ID
* Worksheet
* Cell reference
* Description
* Inputs
* Outputs
* Dependencies
* Engineering purpose

Each formula becomes a candidate for the Calculation Engine.

---

# 7. Rule Extraction

Engineering rules shall be separated from formulas.

Examples include:

* Conditional logic
* Engineering restrictions
* Product requirements
* Standards
* Threshold values

Every extracted rule shall become a structured rule within the Engineering Knowledge Model.

No engineering rule shall remain hidden inside a formula.

---

# 8. Knowledge Classification

Each Excel element shall be classified into one of the following categories:

* Engineering Knowledge
* Engineering Rule
* Formula
* Product Data
* Reference Data
* User Input
* Output
* Presentation

Only presentation remains outside FlowX Core.

---

# 9. Product Mapping

Every product reference shall be mapped to a canonical product.

Supplier-specific article numbers shall become supplier mappings.

Product identity shall be separated from supplier identity.

---

# 10. Validation Dataset

A permanent validation dataset shall be established.

The dataset shall contain representative engineering projects covering:

* normal cases
* boundary cases
* minimum values
* maximum values
* exceptional conditions

This dataset becomes part of the automated regression test suite.

---

# 11. Automated Verification

Every migrated rule and formula shall be verified automatically.

For each validation case:

1. Execute Excel.
2. Execute FlowX.
3. Compare outputs.
4. Record differences.

Differences shall be investigated before migration is approved.

---

# 12. Acceptance Criteria

A worksheet is considered migrated only when:

* all engineering rules are extracted
* all formulas are migrated
* automated validation passes
* manual engineering review is approved
* documentation is complete

---

# 13. Migration Traceability

Every migrated element shall reference:

* Excel worksheet
* Cell reference
* Formula ID
* FlowX Rule ID
* FlowX Formula ID
* Validation test case

This enables complete traceability from Excel to FlowX.

---

# 14. Excel Retirement

Excel may only be retired when:

* all worksheets are migrated
* all validation cases pass
* engineering review is completed
* regression tests are automated
* FlowX becomes the verified reference implementation

After retirement, Excel shall remain archived for historical purposes.

---

# 15. Regression Strategy

Every future change to the Engineering Knowledge Model, Rule Execution Engine or Calculation Engine shall execute the complete regression suite originally derived from Excel.

Regression failures block release until resolved.

---

# 16. Success Criteria

The migration is successful when:

* FlowX produces engineering results equivalent to the verified Excel workbook.
* Engineering knowledge exists only inside FlowX.
* Excel is no longer required for production use.
* Every engineering decision is deterministic, traceable and testable.

---

# 17. Summary

The Excel workbook is the starting point of the FlowX engineering platform.

Its purpose is to transfer engineering knowledge—not implementation details.

The success of the migration is measured by preserved engineering correctness, not by replicated spreadsheets.
