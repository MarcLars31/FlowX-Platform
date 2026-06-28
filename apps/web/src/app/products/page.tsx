"use client";

import { useMemo, useState } from "react";
import { PackageCheck, Search, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/Badge";
import { Input } from "@/components/Input";
import { ProductTable } from "@/components/ProductTable";
import { Select } from "@/components/Select";
import { products as mockProducts } from "@/lib/mock-data";
import type { Product } from "@/types";

function unique(values: string[]) {
  return ["All", ...Array.from(new Set(values))];
}

export default function ProductsPage() {
  const [query, setQuery] = useState("");
  const [supplier, setSupplier] = useState("All");
  const [category, setCategory] = useState("All");
  const [dimension, setDimension] = useState("All");
  const [status, setStatus] = useState("All");
  const [selectedProduct, setSelectedProduct] = useState<Product>(mockProducts[0]);

  const filteredProducts = useMemo(() => {
    return mockProducts.filter((product) => {
      const matchesQuery = [product.name, product.articleNumber, product.supplier]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesSupplier = supplier === "All" || product.supplier === supplier;
      const matchesCategory = category === "All" || product.category === category;
      const matchesDimension =
        dimension === "All" || product.dimension === dimension;
      const matchesStatus = status === "All" || product.status === status;

      return (
        matchesQuery &&
        matchesSupplier &&
        matchesCategory &&
        matchesDimension &&
        matchesStatus
      );
    });
  }, [category, dimension, query, status, supplier]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-flow-700">
          Catalog
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink-950">
          Product Search
        </h1>
      </header>

      <section className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-ink-900">
          <SlidersHorizontal className="h-4 w-4 text-flow-700" />
          Filters
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="xl:col-span-2">
            <Input
              id="product-search"
              label="Search"
              placeholder="Search products or article numbers"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Select
            id="supplier"
            label="Supplier"
            options={unique(mockProducts.map((product) => product.supplier))}
            value={supplier}
            onChange={(event) => setSupplier(event.target.value)}
          />
          <Select
            id="category"
            label="Category"
            options={unique(mockProducts.map((product) => product.category))}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
          <Select
            id="dimension"
            label="Dimension"
            options={unique(mockProducts.map((product) => product.dimension))}
            value={dimension}
            onChange={(event) => setDimension(event.target.value)}
          />
          <Select
            id="status"
            label="Status"
            options={unique(mockProducts.map((product) => product.status))}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-ink-600">
              {filteredProducts.length} products
            </p>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-flow-700 ring-1 ring-ink-200">
              <Search className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
          <ProductTable
            products={filteredProducts}
            selectedProductId={selectedProduct.id}
            onSelect={setSelectedProduct}
          />
        </div>

        <aside className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-flow-50 text-flow-700">
              <PackageCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink-950">
                Product detail
              </h2>
              <p className="text-sm text-ink-500">
                {selectedProduct.articleNumber}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <Badge
              tone={
                selectedProduct.status === "Preferred"
                  ? "teal"
                  : selectedProduct.status === "Verified"
                    ? "green"
                    : "amber"
              }
            >
              {selectedProduct.status}
            </Badge>
            <h3 className="mt-3 text-xl font-semibold tracking-normal text-ink-950">
              {selectedProduct.name}
            </h3>
          </div>

          <dl className="mt-5 space-y-4 text-sm">
            {[
              ["Supplier", selectedProduct.supplier],
              ["Category", selectedProduct.category],
              ["Dimension", selectedProduct.dimension],
              ["Compatibility", selectedProduct.compatibility],
              ["Lead time", selectedProduct.leadTime]
            ].map(([label, value]) => (
              <div
                key={label}
                className="border-b border-ink-100 pb-3 last:border-0 last:pb-0"
              >
                <dt className="text-ink-500">{label}</dt>
                <dd className="mt-1 font-medium text-ink-900">{value}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </section>
    </div>
  );
}
