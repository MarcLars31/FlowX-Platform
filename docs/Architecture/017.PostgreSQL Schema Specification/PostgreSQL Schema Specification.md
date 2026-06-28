---

document_id: 017
title: PostgreSQL Schema Specification
version: 1.0
status: Draft
classification: Internal
owner: Founder
repository: flowx-platform
last_updated: 2026-06-27
review_cycle: Continuous
depends_on:

* 012-data-architecture.md
* 016-canonical-data-model.md
  related_documents:
* 018-platform-api-specification.md
* 019-excel-migration-specification.md
  related_adrs: []

---

# FlowX PostgreSQL Schema Specification

> This document defines the initial relational storage model for the FlowX Platform.

---

# 1. Purpose

This document describes how the FlowX Canonical Data Model is implemented in PostgreSQL.

The database is not the source of architecture.

The database stores the canonical model.

---

# 2. Design Principles

The PostgreSQL schema shall support:

* multi-tenancy
* traceability
* versioning
* immutable engineering history
* auditability
* referential integrity
* future extensibility

---

# 3. Schema Strategy

The initial implementation uses one PostgreSQL database with multiple logical schemas.

```text
public
identity
companies
licensing
projects
knowledge
products
engineering
documents
audit
```

Each schema groups related tables.

---

# 4. Global Rules

Every tenant-owned table shall include:

```sql
company_id UUID NOT NULL
```

Every versioned table shall include:

```sql
version INTEGER NOT NULL
```

Every auditable table shall include:

```sql
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ
created_by UUID
updated_by UUID
```

Deletion should be avoided.

Use:

```sql
status TEXT NOT NULL
archived_at TIMESTAMPTZ
```

---

# 5. Companies Schema

## companies.company

Stores customer organizations.

```sql
CREATE TABLE companies.company (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    legal_name TEXT,
    country_code TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ
);
```

---

# 6. Identity Schema

## identity.user_account

Stores platform users.

```sql
CREATE TABLE identity.user_account (
    id UUID PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies.company(id),
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ,
    UNIQUE(company_id, email)
);
```

## identity.role

```sql
CREATE TABLE identity.role (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL
);
```

## identity.user_role

```sql
CREATE TABLE identity.user_role (
    user_id UUID NOT NULL REFERENCES identity.user_account(id),
    role_id UUID NOT NULL REFERENCES identity.role(id),
    PRIMARY KEY (user_id, role_id)
);
```

---

# 7. Licensing Schema

## licensing.license

```sql
CREATE TABLE licensing.license (
    id UUID PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies.company(id),
    plan_name TEXT NOT NULL,
    status TEXT NOT NULL,
    valid_from TIMESTAMPTZ NOT NULL,
    valid_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL
);
```

## licensing.feature_entitlement

```sql
CREATE TABLE licensing.feature_entitlement (
    id UUID PRIMARY KEY,
    license_id UUID NOT NULL REFERENCES licensing.license(id),
    feature_key TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL
);
```

---

# 8. Projects Schema

## projects.project

```sql
CREATE TABLE projects.project (
    id UUID PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies.company(id),
    project_number TEXT,
    name TEXT NOT NULL,
    customer_name TEXT,
    address TEXT,
    country_code TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ,
    created_by UUID REFERENCES identity.user_account(id)
);
```

## projects.project_version

Project versions are immutable after publication.

```sql
CREATE TABLE projects.project_version (
    id UUID PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies.company(id),
    project_id UUID NOT NULL REFERENCES projects.project(id),
    version INTEGER NOT NULL,
    status TEXT NOT NULL,
    input_snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    created_by UUID REFERENCES identity.user_account(id),
    UNIQUE(project_id, version)
);
```

---

# 9. Knowledge Schema

## knowledge.knowledge_version

```sql
CREATE TABLE knowledge.knowledge_version (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    status TEXT NOT NULL,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL
);
```

## knowledge.rule

```sql
CREATE TABLE knowledge.rule (
    id UUID PRIMARY KEY,
    knowledge_version_id UUID NOT NULL REFERENCES knowledge.knowledge_version(id),
    rule_key TEXT NOT NULL,
    version INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    rule_group TEXT NOT NULL,
    status TEXT NOT NULL,
    definition JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE(knowledge_version_id, rule_key, version)
);
```

## knowledge.formula

```sql
CREATE TABLE knowledge.formula (
    id UUID PRIMARY KEY,
    knowledge_version_id UUID NOT NULL REFERENCES knowledge.knowledge_version(id),
    formula_key TEXT NOT NULL,
    version INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    parameters JSONB NOT NULL,
    definition JSONB NOT NULL,
    unit_requirements JSONB,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE(knowledge_version_id, formula_key, version)
);
```

---

# 10. Products Schema

## products.manufacturer

```sql
CREATE TABLE products.manufacturer (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    country_code TEXT,
    created_at TIMESTAMPTZ NOT NULL
);
```

## products.supplier

```sql
CREATE TABLE products.supplier (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    country_code TEXT,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);
```

## products.product

```sql
CREATE TABLE products.product (
    id UUID PRIMARY KEY,
    product_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    manufacturer_id UUID REFERENCES products.manufacturer(id),
    status TEXT NOT NULL,
    technical_data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ
);
```

## products.product_version

```sql
CREATE TABLE products.product_version (
    id UUID PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products.product(id),
    version INTEGER NOT NULL,
    technical_data JSONB NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE(product_id, version)
);
```

## products.supplier_product

```sql
CREATE TABLE products.supplier_product (
    id UUID PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products.product(id),
    supplier_id UUID NOT NULL REFERENCES products.supplier(id),
    supplier_article_number TEXT NOT NULL,
    supplier_product_name TEXT,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE(supplier_id, supplier_article_number)
);
```

---

# 11. Engineering Schema

## engineering.pipeline_run

Stores one execution of the Engineering Pipeline.

```sql
CREATE TABLE engineering.pipeline_run (
    id UUID PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies.company(id),
    project_id UUID NOT NULL REFERENCES projects.project(id),
    project_version_id UUID NOT NULL REFERENCES projects.project_version(id),
    knowledge_version_id UUID NOT NULL REFERENCES knowledge.knowledge_version(id),
    status TEXT NOT NULL,
    correlation_id UUID NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    executed_by UUID REFERENCES identity.user_account(id)
);
```

## engineering.validation_result

```sql
CREATE TABLE engineering.validation_result (
    id UUID PRIMARY KEY,
    pipeline_run_id UUID NOT NULL REFERENCES engineering.pipeline_run(id),
    status TEXT NOT NULL,
    messages JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);
```

## engineering.rule_trace

```sql
CREATE TABLE engineering.rule_trace (
    id UUID PRIMARY KEY,
    pipeline_run_id UUID NOT NULL REFERENCES engineering.pipeline_run(id),
    rule_id UUID REFERENCES knowledge.rule(id),
    status TEXT NOT NULL,
    input JSONB,
    output JSONB,
    created_at TIMESTAMPTZ NOT NULL
);
```

## engineering.calculation_result

```sql
CREATE TABLE engineering.calculation_result (
    id UUID PRIMARY KEY,
    pipeline_run_id UUID NOT NULL REFERENCES engineering.pipeline_run(id),
    formula_id UUID REFERENCES knowledge.formula(id),
    input JSONB NOT NULL,
    result JSONB NOT NULL,
    trace JSONB,
    created_at TIMESTAMPTZ NOT NULL
);
```

---

# 12. Documents Schema

## documents.material_list

```sql
CREATE TABLE documents.material_list (
    id UUID PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies.company(id),
    project_id UUID NOT NULL REFERENCES projects.project(id),
    project_version_id UUID NOT NULL REFERENCES projects.project_version(id),
    pipeline_run_id UUID NOT NULL REFERENCES engineering.pipeline_run(id),
    version INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    created_by UUID REFERENCES identity.user_account(id),
    UNIQUE(project_id, version)
);
```

## documents.material_list_line

```sql
CREATE TABLE documents.material_list_line (
    id UUID PRIMARY KEY,
    material_list_id UUID NOT NULL REFERENCES documents.material_list(id),
    product_id UUID REFERENCES products.product(id),
    product_version_id UUID REFERENCES products.product_version(id),
    supplier_product_id UUID REFERENCES products.supplier_product(id),
    description TEXT NOT NULL,
    quantity NUMERIC(18,4) NOT NULL,
    unit TEXT NOT NULL,
    line_metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL
);
```

---

# 13. Audit Schema

## audit.audit_event

```sql
CREATE TABLE audit.audit_event (
    id UUID PRIMARY KEY,
    company_id UUID,
    user_id UUID,
    event_type TEXT NOT NULL,
    aggregate_type TEXT NOT NULL,
    aggregate_id UUID,
    correlation_id UUID,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);
```

Audit events are append-only.

They shall never be updated or deleted.

---

# 14. Indexing Strategy

Indexes shall support:

* tenant filtering
* project lookup
* pipeline trace lookup
* product search
* audit investigation

Initial indexes:

```sql
CREATE INDEX idx_project_company_id ON projects.project(company_id);

CREATE INDEX idx_project_version_project_id ON projects.project_version(project_id);

CREATE INDEX idx_pipeline_run_project_id ON engineering.pipeline_run(project_id);

CREATE INDEX idx_pipeline_run_correlation_id ON engineering.pipeline_run(correlation_id);

CREATE INDEX idx_material_list_project_id ON documents.material_list(project_id);

CREATE INDEX idx_audit_event_company_id ON audit.audit_event(company_id);

CREATE INDEX idx_audit_event_correlation_id ON audit.audit_event(correlation_id);

CREATE INDEX idx_product_category ON products.product(category);

CREATE INDEX idx_supplier_product_article ON products.supplier_product(supplier_article_number);
```

---

# 15. Multi-Tenancy

Tenant isolation is based on `company_id`.

Every company-owned table shall include `company_id`.

Application-layer authorization is mandatory.

Database-level Row Level Security may be introduced later.

---

# 16. Immutability Rules

The following records shall be treated as immutable:

* Project Version
* Knowledge Version
* Rule Version
* Formula Version
* Pipeline Run
* Rule Trace
* Calculation Result
* Material List
* Audit Event

Corrections create new records.

---

# 17. JSONB Usage

JSONB may be used for:

* rule definitions
* formula definitions
* technical product data
* pipeline snapshots
* trace data

JSONB shall not be used to avoid proper modeling of stable business concepts.

---

# 18. Migration Strategy

All schema changes shall be handled through database migrations.

Rules:

* no manual production schema changes
* every migration is version controlled
* destructive migrations require explicit review
* rollback strategy must be documented

---

# 19. Future Considerations

Future versions may introduce:

* Row Level Security
* Read models
* Materialized views
* Full-text search
* Vector search
* Event store
* Data warehouse

These shall not become the source of truth unless explicitly approved.

---

# 20. Summary

The PostgreSQL schema stores the FlowX Canonical Data Model.

It supports tenant isolation, traceability, versioning and immutable engineering history.

The database implementation shall never override the domain architecture.

The database stores FlowX knowledge and results.

It does not define them.
