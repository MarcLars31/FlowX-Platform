---

document_id: 009
title: Calculation Engine
version: 1.0
status: Draft
classification: Internal
owner: Founder
repository: flowx-platform
last_updated: 2026-06-27
review_cycle: Continuous
depends_on:

* 006-flowx-core-architecture.md
* 007-engineering-knowledge-model.md
* 008-rule-execution-engine.md
  related_documents:
* 010-product-catalog.md
* 011-database-design.md
  related_adrs: []

---

# FlowX Calculation Engine

> The Calculation Engine performs deterministic engineering calculations.

---

# 1. Purpose

The Calculation Engine transforms validated engineering input into deterministic engineering output.

It performs calculations.

It does not decide **which** calculations should be performed.

That responsibility belongs to the Rule Execution Engine.

---

# 2. Responsibilities

The Calculation Engine is responsible for:

* Engineering formulas
* Mathematical calculations
* Quantity calculations
* Dimension calculations
* Derived values
* Unit-safe calculations
* Result generation

The Calculation Engine shall never:

* execute engineering rules
* select products
* validate projects
* communicate with databases
* know supplier information
* know user interface concepts

---

# 3. Design Principles

The engine shall be:

* deterministic
* stateless
* pure
* repeatable
* testable
* technology independent

Given identical input it shall always return identical output.

---

# 4. Inputs

The engine receives:

* Formula identifier
* Parameters
* Units
* Context
* Configuration

The Calculation Engine never loads its own data.

---

# 5. Outputs

The engine returns:

* Numerical results
* Derived values
* Intermediate values
* Calculation trace
* Warnings

Results shall be immutable.

---

# 6. Formula Model

Every calculation is represented as a formula.

Each formula contains:

* Identifier
* Name
* Version
* Description
* Parameters
* Expected Units
* Formula Definition
* Validation Constraints

Formulas are versioned.

Existing formulas are never overwritten.

---

# 7. Formula Library

The Formula Library contains reusable engineering formulas.

Examples:

* Pipe area
* Flow velocity
* Pressure loss
* Pipe volume
* Quantity multipliers
* Safety factors
* Rounding functions

The library shall contain no business rules.

---

# 8. Calculation Pipeline

```text
Receive Request
        │
        ▼
Validate Parameters
        │
        ▼
Convert Units
        │
        ▼
Execute Formula
        │
        ▼
Validate Result
        │
        ▼
Return Result
```

Every calculation follows the same pipeline.

---

# 9. Units

All calculations are unit-aware.

Examples:

* mm
* m
* inch
* litre
* bar
* kPa

Internal conversions are centralized.

No formula performs ad hoc conversions.

---

# 10. Numerical Precision

Engineering calculations require predictable precision.

The engine shall define:

* Decimal precision
* Rounding strategy
* Tolerance
* Floating-point handling

Precision rules shall be consistent throughout the platform.

---

# 11. Calculation Trace

Every calculation generates a trace.

The trace includes:

* Formula version
* Parameters
* Converted units
* Intermediate values
* Final result

The trace enables:

* debugging
* auditing
* verification
* customer support

---

# 12. Error Handling

Invalid parameters produce structured validation errors.

Formula failures shall never produce undefined behaviour.

Errors are explicit.

---

# 13. Performance

Calculations shall be optimized for repeatability.

Where appropriate:

* immutable results
* caching of reference data
* reusable formula definitions

Business correctness always takes priority over performance.

---

# 14. Testing

Every formula shall have:

* Reference test
* Boundary test
* Invalid input test
* Regression test

The initial reference implementation is the verified Excel workbook.

Every migrated formula shall produce equivalent results before Excel can be retired as the reference.

---

# 15. Extensibility

New engineering disciplines extend the Formula Library.

The Calculation Engine itself should rarely change.

Growth occurs by adding formulas, not modifying the engine.

---

# 16. Architectural Constraints

The Calculation Engine:

* receives requests
* executes formulas
* returns results

It never:

* loads products
* activates rules
* queries databases
* selects suppliers
* formats documents

Each responsibility belongs to another component.

---

# 17. Determinism

Determinism is mandatory.

The Calculation Engine shall never produce different outputs from identical inputs.

Randomness is prohibited.

Time-dependent calculations are prohibited unless explicitly modeled as an input parameter.

---

# 18. Strategic Importance

The Calculation Engine is one of the strategic assets of FlowX.

It transforms engineering knowledge into reliable mathematical results.

The engine shall remain stable even as the platform evolves.

---

# 19. Summary

The Calculation Engine is responsible for computation only.

Knowledge defines what exists.

The Rule Execution Engine decides what to execute.

The Calculation Engine computes.

The Product Engine fulfills the engineering result.

This separation of responsibilities is fundamental to the FlowX architecture.
