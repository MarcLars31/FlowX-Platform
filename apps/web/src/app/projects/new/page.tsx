"use client";

import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";

export default function CreateProjectPage() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-flow-700">
          Projects
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink-950">
          Create Project
        </h1>
      </div>

      <form
        className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          router.push("/projects/demo");
        }}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <Input
            id="project-name"
            label="Project name"
            defaultValue="Oslo Health Campus"
          />
          <Input id="customer" label="Customer" defaultValue="Nordbygg Eiendom" />
          <Input
            id="address"
            label="Address"
            defaultValue="Sognsveien 80, Oslo"
          />
          <Select
            id="country"
            label="Country"
            options={["Norway", "Sweden", "Denmark", "Finland"]}
            defaultValue="Norway"
          />
          <Select
            id="standard"
            label="Standard"
            options={["NS-EN 12845", "SS-EN 12845", "DBI 251", "SFS-EN 12845"]}
            defaultValue="NS-EN 12845"
          />
          <Select
            id="system-type"
            label="System type"
            options={[
              "Wet sprinkler system",
              "Dry sprinkler system",
              "ESFR sprinkler system",
              "Pre-action sprinkler system"
            ]}
            defaultValue="Wet sprinkler system"
          />
          <Select
            id="preferred-supplier"
            label="Preferred supplier"
            options={["Ahlsell", "Dahl", "Broedrene Dahl", "Onninen"]}
            defaultValue="Ahlsell"
          />
        </div>

        <div className="mt-8 flex justify-end">
          <Button type="submit">
            Create Project
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </form>
    </div>
  );
}
