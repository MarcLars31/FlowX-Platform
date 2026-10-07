import type { DeliveryReview } from "./project-delivery";

export type ProjectWorkPackage = {
  id: string; scope_type: "chapter" | "group" | "pdf_chapter" | "post"; scope_value: string;
  assigned_to: string; due_date: string | null; note: string; revision: number;
};
export type ProjectDeliveryDocument = {
  id: string; file_name: string; state: string; role: string;
  revision_label: string; revision: number; fileId?: string;
};
export type ProjectDeliveryData = {
  manager: boolean; enforced: boolean; userId: string;
  packages: ProjectWorkPackage[];
  members: { user_id: string; label: string }[];
  documents: ProjectDeliveryDocument[];
  reviews: { requirement_id: string; product_revision: number; review: DeliveryReview }[];
  requirements: { id: string; category: string; edit_revision: number; value_json: unknown; actionable?: boolean; source_document_id?: string; source_technical_description_document_id?: string }[];
};
type Snapshot = { data: ProjectDeliveryData | null; error: string; refreshing: boolean };
export type ProjectDeliveryResource = ReturnType<typeof createProjectDeliveryResource>;

// Owned by one project workspace, never shared across users or persisted in storage.
export function createProjectDeliveryResource(projectId: string, fetcher: typeof fetch = fetch) {
  let snapshot: Snapshot = { data: null, error: "", refreshing: false };
  let generation = 0;
  let pending: { promise: Promise<void>; controller: AbortController } | null = null;
  const listeners = new Set<() => void>();

  function update(next: Snapshot) {
    snapshot = next;
    listeners.forEach(listener => listener());
  }

  function refresh(force = false): Promise<void> {
    if (pending && !force) return pending.promise;
    const currentGeneration = ++generation;
    pending?.controller.abort();
    const controller = new AbortController();
    update({ ...snapshot, error: "", refreshing: true });

    const promise = Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      const response = await fetcher(`/api/projects/${encodeURIComponent(projectId)}/delivery`, {
        cache: "no-store", signal: controller.signal
      });
      if (currentGeneration !== generation) return;
      // A cached view must disappear when access has been revoked or the project removed.
      if ([401, 403, 404].includes(response.status)) {
        update({ ...snapshot, data: null });
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Projektstyrningen kunde inte hämtas.");
      if (currentGeneration === generation) update({ data: payload, error: "", refreshing: false });
    }).catch((error: unknown) => {
      if (currentGeneration === generation && !controller.signal.aborted) {
        update({ ...snapshot, error: error instanceof Error ? error.message : "Projektstyrningen kunde inte hämtas.", refreshing: false });
      }
    }).finally(() => {
      if (currentGeneration === generation) {
        pending = null;
        if (snapshot.refreshing) update({ ...snapshot, refreshing: false });
      }
    });
    pending = { promise, controller };
    return promise;
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    refresh,
    cancelPending() {
      generation++;
      pending?.controller.abort();
      pending = null;
      if (snapshot.refreshing) update({ ...snapshot, refreshing: false });
    }
  };
}
