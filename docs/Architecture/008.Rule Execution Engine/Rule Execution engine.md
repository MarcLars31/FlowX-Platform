---

document_id: 008
title: Rule Execution Engine
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
  related_documents:
* 009-calculation-engine.md
* 010-product-catalog.md
  related_adrs: []

---

# FlowX Rule Execution Engine

> The Rule Execution Engine evaluates and executes engineering rules defined by the Engineering Knowledge Model.

---

# 1. Purpose

The Rule Execution Engine is responsible for determining which engineering rules apply to a specific engineering problem.

It executes rules.

It does not own rules.

Rules belong to the Engineering Knowledge Model.

---

# 2. Responsibilities

The Rule Execution Engine shall:

* Load rules
* Evaluate conditions
* Resolve dependencies
* Execute rule actions
* Produce deterministic results
* Generate rule trace information

The Rule Execution Engine shall never:

* store rules
* contain engineering knowledge
* perform engineering calculations
* access databases
* know about user interfaces

---

# 3. Inputs

The engine consumes:

* Project
* Project Version
* Engineering Context
* Knowledge Version
* Configuration
* User Selections

---

# 4. Outputs

The engine produces:

* Activated Rules
* Rule Decisions
* Execution Trace
* Validation Requests
* Calculation Requests
* Product Requests

---

# 5. Rule Lifecycle

Every rule follows the same lifecycle.

```text
Load

↓

Evaluate

↓

Activate

↓

Execute

↓

Record

↓

Return Result
```

Every execution is logged.

---

# 6. Rule Structure

Every engineering rule contains:

* Identifier
* Name
* Description
* Rule Group
* Version
* Preconditions
* Conditions
* Actions
* Priority
* Status

Rules are immutable.

New versions create new rules.

---

# 7. Rule Evaluation

Rule evaluation is deterministic.

Given identical:

* inputs
* knowledge version
* project configuration

the engine shall always produce identical output.

---

# 8. Rule Priority

Rules execute according to priority.

Priority resolves conflicts.

Rules never execute randomly.

---

# 9. Rule Dependencies

Rules may depend on other rules.

Dependencies shall form a directed acyclic graph.

Circular dependencies are prohibited.

---

# 10. Rule Groups

Rules are organized into logical groups.

Examples:

* General Rules
* Standard Rules
* Sprinkler Rules
* Product Rules
* Validation Rules
* Company Rules

Grouping improves maintainability.

---

# 11. Conditions

Conditions evaluate engineering facts.

Examples:

* Pipe Diameter
* Hazard Classification
* Building Type
* Water Supply
* Pressure
* Temperature

Conditions never modify state.

---

# 12. Actions

Actions request work from other Core components.

Examples:

* Validate
* Calculate
* Select Product
* Add Requirement
* Raise Warning
* Raise Error

Actions do not communicate with infrastructure.

---

# 13. Rule Trace

Every execution produces a Rule Trace.

The trace records:

* Executed Rules
* Skipped Rules
* Failed Conditions
* Activated Conditions
* Generated Actions

This enables full auditability.

---

# 14. Error Handling

Rule execution never silently fails.

Failures produce structured errors.

Unexpected exceptions terminate execution.

---

# 15. Performance

The engine shall execute only applicable rules.

Inactive rules are ignored.

Knowledge loading should occur once per execution context.

---

# 16. Extensibility

New engineering disciplines add new rules.

The Rule Execution Engine itself should rarely change.

The platform evolves by adding knowledge, not rewriting the engine.

---

# 17. Testing

Every rule shall have:

* Positive test
* Negative test
* Boundary test

Rule groups shall additionally have integration tests.

The Excel reference workbook shall be used during migration to verify that FlowX produces equivalent engineering behaviour.

---

# 18. Architectural Constraints

The Rule Execution Engine:

* depends on the Knowledge Model
* requests calculations
* requests validation
* requests product selection

It never owns those responsibilities.

---

# 19. Summary

The Rule Execution Engine is responsible for executing engineering rules.

Engineering knowledge belongs to the Knowledge Model.

Calculations belong to the Calculation Engine.

The Rule Execution Engine orchestrates engineering decisions while remaining deterministic, auditable and technology independent.
