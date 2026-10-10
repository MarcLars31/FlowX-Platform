const CARD_STATE = "scipxProductCard";

type HistoryHost = {
  history: Pick<History, "state" | "pushState" | "replaceState" | "back" | "forward">;
  addEventListener(type: "popstate", listener: () => void): void;
  removeEventListener(type: "popstate", listener: () => void): void;
};

/** One same-page history entry per open card; preserve the router's state. */
export function createProductCardHistory(host: HistoryHost, scope: string, handlers: {
  canLeave: () => boolean;
  onNavigate: (requirementId: string | null) => void;
}) {
  const currentCard = () => {
    const entry = host.history.state?.[CARD_STATE];
    return entry?.scope === scope && typeof entry.requirementId === "string" ? entry.requirementId : null;
  };
  let activeId: string | null = currentCard();
  let traversing = false;
  let pendingClose = false;

  function close() {
    activeId = null;
    if (traversing) { pendingClose = true; return; }
    if (currentCard()) {
      traversing = true;
      host.history.back();
    }
  }

  const onPopState = () => {
    if (traversing) {
      traversing = false;
      if (pendingClose) { pendingClose = false; close(); }
      return;
    }
    const nextId = currentCard();
    if (nextId === activeId) return;
    if (activeId && !handlers.canLeave()) {
      // Back already reached the table entry. Restore the card entry without
      // adding another entry or discarding the user's edits.
      traversing = true;
      host.history.forward();
      return;
    }
    activeId = nextId;
    handlers.onNavigate(nextId);
  };
  host.addEventListener("popstate", onPopState);

  return {
    current: () => activeId,
    open(requirementId: string) {
      if (traversing) return false;
      const state = { ...host.history.state, [CARD_STATE]: { scope, requirementId } };
      if (currentCard()) host.history.replaceState(state, "");
      else host.history.pushState(state, "");
      activeId = requirementId;
      return true;
    },
    close,
    dispose() { host.removeEventListener("popstate", onPopState); }
  };
}
