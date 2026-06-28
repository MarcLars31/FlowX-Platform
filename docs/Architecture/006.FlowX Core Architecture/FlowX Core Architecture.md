---

document_id: 006
title: FlowX Core Architecture
version: 1.0
status: Draft
classification: Internal
owner: Founder
repository: flowx-platform
last_updated: 2026-06-27
review_cycle: Continuous
depends_on:

* 003-software-architecture.md
* 004-domain-model.md
* 005-module-architecture.md
  related_documents:
* 007-database-design.md
* 008-rule-engine.md
* 009-calculation-engine.md
  related_adrs: []

---

# FlowX Core Architecture

> FlowX Core is the engineering heart of the FlowX Platform.

---

# 1. Purpose

FlowX Core contains all engineering knowledge and deterministic business logic.

It is the most valuable software asset within the platform.

Everything else exists to support, configure or present the results produced by FlowX Core.

---

# 2. Design Goals

FlowX Core shall be:

* deterministic
* testable
* technology independent
* reusable
* modular
* maintainable
* extensible

Core shall never depend on any specific framework, database or user interface.

---

# 3. Architectural Principle

FlowX Core represents engineering knowledge.

It does not represent technology.

Technology surrounds Core.

Core never surrounds technology.

---

# 4. Responsibilities

FlowX Core is responsible for:

* Engineering knowledge
* Business rules
* Validation
* Calculations
* Product selection
* Unit conversions
* Rule execution
* Result generation

FlowX Core is **not** responsible for:

* Authentication
* Authorization
* Databases
* REST APIs
* Web applications
* PDF generation
* Excel export
* Email
* Logging implementation
* Cloud infrastructure

---

# 5. Internal Structure

```text
FlowX Core

├── Knowledge Engine
├── Rule Engine
├── Validation Engine
├── Calculation Engine
├── Product Engine
├── Unit Engine
├── Result Engine
└── Contracts
```

Every component has one responsibility.

---

# 6. Knowledge Engine

## Purpose

Represents engineering knowledge.

Knowledge includes:

* Standards
* Engineering concepts
* Product relationships
* Compatibility
* Constraints
* Terminology

The Knowledge Engine does not perform calculations.

It provides knowledge.

---

# 7. Rule Engine

## Purpose

Determines which engineering rules apply.

Responsibilities:

* Rule selection
* Rule execution
* Rule ordering
* Rule activation
* Rule dependency management

Rules remain deterministic.

No randomness is permitted.

---

# 8. Validation Engine

## Purpose

Ensures input quality before calculations begin.

Validation includes:

* Required values
* Data types
* Engineering consistency
* Standard compliance
* Configuration correctness

Invalid projects shall never reach the Calculation Engine.

---

# 9. Calculation Engine

## Purpose

Transforms validated engineering input into deterministic engineering output.

Responsibilities include:

* Quantity calculations
* Dimension calculations
* Derived values
* Engineering formulas
* Material calculations

The Calculation Engine does not choose suppliers.

---

# 10. Product Engine

## Purpose

Converts engineering output into purchasable products.

Responsibilities:

* Product matching
* Compatibility verification
* Alternative products
* Supplier mapping
* Product substitution

Engineering rules remain outside the Product Engine.

---

# 11. Unit Engine

## Purpose

Provides consistent engineering units.

Examples:

* mm
* cm
* m
* inch
* litre
* bar
* kPa

Unit conversion is centralized.

No module performs its own conversions.

---

# 12. Result Engine

## Purpose

Produces standardized outputs.

Examples:

* Material List
* Calculation Result
* Validation Report
* Rule Trace
* Engineering Summary

The Result Engine never formats PDFs or Excel.

It only produces structured domain results.

---

# 13. Contracts

FlowX Core exposes public contracts.

Other modules communicate only through these contracts.

Internal implementation details remain hidden.

---

# 14. Dependency Rules

FlowX Core depends on nothing outside itself.

The following dependencies are forbidden:

* SQL
* PostgreSQL
* React
* Next.js
* FastAPI
* HTTP
* Redis
* RabbitMQ
* Azure
* AWS
* PDF libraries
* Excel libraries

Technology may depend on Core.

Core never depends on technology.

---

# 15. Execution Pipeline

Every calculation follows the same pipeline.

```text
Project Input
      │
      ▼
Validation Engine
      │
      ▼
Knowledge Engine
      │
      ▼
Rule Engine
      │
      ▼
Calculation Engine
      │
      ▼
Product Engine
      │
      ▼
Result Engine
```

The pipeline is deterministic.

Given identical input, identical output shall always be produced.

---

# 16. Testing Requirements

Every Core component shall have:

* Unit Tests
* Integration Tests
* Regression Tests

Additionally:

Every engineering rule shall have a reference test based on verified engineering examples.

For the initial Material Generator, the Excel workbook serves as the reference implementation until every rule has been validated and migrated into FlowX Core.

---

# 17. Extensibility

Future engineering domains shall reuse the same Core.

Examples:

* Sprinkler
* Plumbing
* HVAC
* Electrical
* District Heating

New domains extend Core.

They do not replace Core.

---

# 18. Architectural Constraints

The following constraints are mandatory.

* Business logic exists only inside FlowX Core.
* Engineering knowledge exists only inside the Knowledge Engine.
* Calculations exist only inside the Calculation Engine.
* Validation exists only inside the Validation Engine.
* Product selection exists only inside the Product Engine.
* Unit conversions exist only inside the Unit Engine.

This ensures Single Source of Truth across the engineering domain.

---

# 19. Strategic Importance

FlowX Core is the primary intellectual property of the FlowX Platform.

The competitive advantage of FlowX is created through:

* Engineering knowledge
* Deterministic calculations
* Accurate rule execution
* Reliable product selection

Everything else is supporting infrastructure.

---

# 20. Summary

FlowX Core is the engineering brain of the platform.

Its purpose is to transform engineering knowledge into predictable, verifiable and reusable software behavior.

Every future module shall consume FlowX Core.

No future module shall duplicate its responsibilities.
