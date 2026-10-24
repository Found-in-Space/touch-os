/** Authoritative value binding, including stale asynchronous request rejection. */
export interface ValueBinding<T> {
  get(): { value: T; pending: boolean; rejected: boolean };
  request(value: T): void;
  /** External state wins and invalidates pending requests. */
  reconcile(value: T): void;
  begin(): void;
  commit(): void;
  cancel(): void;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}
export function createValueBinding<T>(options: {
  value: T;
  apply(value: T): T | Promise<T>;
  cancellation: "retain" | "rollback";
}): ValueBinding<T> {
  let value = options.value;
  let initial = value;
  let pending = false;
  let rejected = false;
  let revision = 0;
  let disposed = false;
  const listeners = new Set<() => void>();
  const publish = () => { for (const listener of listeners) listener(); };
  const binding: ValueBinding<T> = {
    get: () => ({ value, pending, rejected }),
    request(next) {
      if (disposed) return;
      const request = ++revision;
      rejected = false;
      const accept = (applied: T) => {
        if (disposed || request !== revision) return;
        value = applied; pending = false; publish();
      };
      const reject = () => {
        if (disposed || request !== revision) return;
        pending = false; rejected = true; publish();
      };
      try {
        const result = options.apply(next);
        if (result instanceof Promise) { pending = true; publish(); void result.then(accept, reject); }
        else accept(result);
      } catch { reject(); }
    },
    reconcile(next) {
      if (disposed) return;
      ++revision; value = next; pending = rejected = false; publish();
    },
    begin() { initial = value; },
    commit() { initial = value; },
    cancel() {
      ++revision; pending = false;
      if (options.cancellation === "rollback") binding.request(initial);
      else publish();
    },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() { disposed = true; ++revision; listeners.clear(); }
  };
  return binding;
}
