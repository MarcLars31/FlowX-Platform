---

document_id: 007
title: Engineering Knowledge Model
version: 1.0
status: Draft
classification: Internal
owner: Founder
repository: flowx-platform
last_updated: 2026-06-27
review_cycle: Continuous
depends_on:

* 004-domain-model.md
* 006-flowx-core-architecture.md
  related_documents:
* 008-rule-engine.md
* 009-calculation-engine.md
* 010-product-catalog.md
  related_adrs: []

---

# FlowX Engineering Knowledge Model

> Engineering knowledge is the primary intellectual property of the FlowX Platform.

---

# 1. Purpose

This document defines how engineering knowledge is represented inside FlowX.

The objective is to separate knowledge from software implementation.

Software executes knowledge.

Knowledge defines behavior.

---

# 2. Philosophy

Engineering knowledge shall never exist only in:

* source code
* Excel files
* documentation
* developer memory

Engineering knowledge shall exist as structured domain information.

---

# 3. Knowledge Hierarchy

FlowX represents engineering knowledge using the following hierarchy.

```text
Domain

↓

Standard

↓

Rule Group

↓

Rule

↓

Condition

↓

Action

↓

Result
```

Each level has one responsibility.

---

# 4. Knowledge Types

The platform distinguishes between different knowledge categories.

## Standards

Examples:

* EN
* NFPA
* Company standards
* Customer standards

Standards activate rule groups.

---

## Rules

Rules describe engineering behavior.

Examples:

* Required products
* Dimension limits
* Pressure requirements
* Compatibility
* Safety constraints

Rules never reference user interface concepts.

---

## Engineering Concepts

Concepts describe the engineering language.

Examples:

* Pipe
* Valve
* Sprinkler
* Branch
* Pump
* Zone
* Flow
* Pressure

Concepts remain stable over time.

---

## Product Knowledge

Product knowledge includes:

* Compatibility
* Dimensions
* Connections
* Certifications
* Alternatives

Products do not contain engineering rules.

---

## Calculation Knowledge

Calculation knowledge defines:

* formulas
* engineering equations
* rounding rules
* conversion rules

Calculations remain deterministic.

---

# 5. Knowledge Ownership

Every knowledge element has exactly one owner.

| Knowledge | Owner              |
| --------- | ------------------ |
| Standards | Knowledge Engine   |
| Rules     | Rule Engine        |
| Formulas  | Calculation Engine |
| Products  | Product Catalog    |
| Units     | Unit Engine        |

---

# 6. Knowledge Relationships

```text
Standard

↓

Rule Group

↓

Rule

↓

Condition

↓

Calculation

↓

Product Selection

↓

Material List
```

Knowledge always flows in one direction.

---

# 7. Knowledge Principles

Engineering knowledge shall be:

* explicit
* deterministic
* versioned
* testable
* traceable
* reusable

---

# 8. Versioning

Knowledge evolves.

Historical projects must always execute using the knowledge version that was active when the project was created, unless the user explicitly upgrades the project.

This guarantees reproducibility and auditability.

---

# 9. Traceability

Every generated material list shall be traceable back to:

* Knowledge version
* Rule version
* Calculation version
* Product version

This enables debugging, compliance and customer trust.

---

# 10. Future Expansion

The Knowledge Model shall support additional engineering disciplines without redesign.

Examples include:

* Plumbing
* HVAC
* Electrical
* Fire Protection
* District Heating

New disciplines add knowledge.

They do not replace the model.

---

# 11. Summary

Engineering knowledge is the strategic asset of FlowX.

The software platform exists to organize, execute and preserve that knowledge.

All future rule engines, calculation engines and AI capabilities shall consume the same structured knowledge model.
