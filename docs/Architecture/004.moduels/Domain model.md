---

document_id: 004
title: Domain Model
version: 1.0
status: Draft
classification: Internal
owner: Founder
repository: flowx-platform
last_updated: 2026-06-27
review_cycle: Continuous
depends_on:

* 000-project-charter.md
* 001-constitution.md
* 003-software-architecture.md
  related_documents:
* 005-module-architecture.md
* 006-database-design.md
* 007-calculation-engine.md
  related_adrs: []

---

# FlowX Domain Model

> The Domain Model defines the business concepts of the FlowX Platform.

---

# 1. Purpose

The purpose of this document is to define the language of FlowX.

Every developer, tester, AI assistant and stakeholder shall use the same terminology.

The Domain Model is independent of:

* databases
* APIs
* programming languages
* frontend applications

It represents the business.

---

# 2. Core Principle

FlowX models the real engineering world.

The software adapts to the domain.

The domain never adapts to the software.

---

# 3. Domain Overview

```text
Company
│
├── Users
├── Licenses
├── Suppliers
└── Projects
        │
        ▼
Project
│
├── Calculations
├── Material Lists
├── Documents
├── Drawings
└── Project Versions
        │
        ▼
Calculation
│
├── Rules
├── Inputs
├── Outputs
├── Products
└── Validation
```

---

# 4. Core Entities

The following entities represent the foundation of FlowX.

## Company

Represents a customer organization.

Responsibilities:

* owns projects
* owns users
* owns licenses
* owns supplier settings
* owns company configuration

A Company is the highest business boundary.

---

## User

Represents a person using FlowX.

A User belongs to exactly one Company.

Responsibilities:

* creates projects
* performs calculations
* manages documents

Users never own business data.

Companies do.

---

## License

Defines which capabilities are available.

Examples:

* Material Generator
* AI Assistant
* Product Catalog
* Supplier Integrations

Licenses belong to Companies.

---

## Project

Represents one engineering assignment.

A Project contains:

* metadata
* calculations
* material lists
* documents
* versions

Projects are immutable historical records.

Changes create new versions.

---

## Project Version

Every significant modification creates a new Project Version.

This ensures:

* traceability
* auditing
* rollback
* comparison

Engineering history must never be lost.

---

## Calculation

A Calculation represents one deterministic engineering operation.

It contains:

* inputs
* applied rules
* calculated outputs
* validation results

A Calculation can always be reproduced.

---

## Rule

Represents engineering knowledge.

Examples:

* standards
* compatibility
* calculation logic
* restrictions
* engineering requirements

Rules are independent of products.

---

## Product

Represents one purchasable engineering item.

A Product includes:

* supplier
* manufacturer
* dimensions
* compatibility
* documentation
* identifiers

Products never contain engineering logic.

---

## Material List

Represents the purchasing result of one or more calculations.

Contains:

* products
* quantities
* units
* substitutions
* supplier references

The Material List is generated.

It is never manually maintained.

---

## Supplier

Represents a manufacturer or distributor.

Suppliers provide:

* products
* documentation
* metadata
* availability

Suppliers do not define engineering rules.

---

## Standard

Represents an engineering standard.

Examples:

* national standards
* company standards
* customer requirements

Standards activate engineering rules.

---

## Drawing

Represents engineering drawings used by the project.

Drawings are inputs.

FlowX extracts engineering information from drawings.

Drawings remain immutable.

---

## Document

Represents generated project documentation.

Examples:

* material lists
* reports
* PDFs
* calculations

Documents are generated outputs.

---

# 5. Relationships

The following relationships exist.

```text
Company

├── Users

├── Projects

├── Licenses

└── Suppliers
```

Projects contain:

```text
Project

├── Versions

├── Calculations

├── Material Lists

├── Drawings

└── Documents
```

Calculations contain:

```text
Calculation

├── Inputs

├── Rules

├── Validation

├── Outputs

└── Products
```

---

# 6. Domain Rules

The following rules always apply.

## Rule 1

A Project always belongs to exactly one Company.

---

## Rule 2

Every Calculation belongs to one Project Version.

---

## Rule 3

Products never contain engineering knowledge.

---

## Rule 4

Rules never depend on suppliers.

---

## Rule 5

Material Lists are generated.

They are never manually edited.

---

## Rule 6

Project history is immutable.

Nothing is overwritten.

---

## Rule 7

Every calculation must be reproducible.

---

## Rule 8

Every engineering decision shall be traceable.

---

# 7. Domain Boundaries

FlowX consists of multiple bounded contexts.

Examples include:

* Identity
* Licensing
* Projects
* Calculations
* Product Catalog
* Documents
* AI
* Administration

Each context owns its own business concepts.

---

# 8. Ubiquitous Language

The following words have one precise meaning within FlowX.

| Term          | Definition                          |
| ------------- | ----------------------------------- |
| Company       | Customer organization               |
| User          | Authenticated person                |
| Project       | Engineering assignment              |
| Version       | Immutable project snapshot          |
| Calculation   | Deterministic engineering operation |
| Rule          | Engineering knowledge               |
| Product       | Purchasable item                    |
| Material List | Generated purchasing list           |
| Supplier      | Product provider                    |
| Drawing       | Engineering input                   |
| Document      | Generated output                    |
| License       | Platform entitlement                |

No alternative terminology shall be used in code or documentation.

---

# 9. Future Expansion

The Domain Model shall support future disciplines including:

* HVAC
* Plumbing
* Sprinkler
* Fire Protection
* Electrical
* District Heating

The model shall evolve without breaking existing concepts.

---

# 10. Summary

The Domain Model represents the engineering business, not the software implementation.

All future databases, APIs, user interfaces and services shall derive from this model.

The Domain Model is the authoritative language of the FlowX Platform.
