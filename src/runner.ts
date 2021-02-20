import { useEffect, useMemo, useRef, useState } from "react";
import { bottom, pass, Sum } from "./support";

export type Runner<P extends any[], T> = {
  start(...params: P): void;
  thunk(...params: P): () => void;
  when: Sum<{
    /**
     * The initial state. Will only ever be called once.
     */
    idle: [];

    /**
     * The promise is currently being resolved.
     *
     * @param abort Cancels the call and immediately transitions to the failed
     * state with the string `"aborted"` as reason.
     */
    busy: [abort: () => void];

    /**
     * The promise was resolved successfully.
     * 
     * @param result The promised value.
     */
    done: [result: T];

    /**
     * The promise was rejected.
     * 
     * @param reason The cause of the rejection.
     * @param retry Re-runs the request. Does nothing if the run was aborted
     * during the busy state.
     */
    failed: [reason: any, retry: () => void];
  }>;
};

export type Controller = {
  onAbort(cancel: () => void): void;
  returnWhenAborted(): void;
}

export function useRunner<P extends any[], T>(
  run: (this: Controller, ...params: P) => Promise<T>,
): Runner<P, T> {
  type Event =
    | { tag: "idle" }
    | { tag: "started"; params: P }
    | { tag: "fulfilled"; payload: T }
    | { tag: "rejected"; reason: any; params: P }
    | { tag: "aborted" };

  const [event, trigger] = useState<Event>({ tag: "idle" });
  const my = useRef({
    controller: {
      run,  // TODO: should this be allowed to change?
      onAbort(cancel: () => void) {
        my.cancel = cancel;
      },
      returnWhenAborted() {
        if (my.aborted) {
          throw new Error("It's pointless to continue");
        }
      }
    },
    round: 0,
    aborted: false,
    abort(prev: Event): Event {
      if (!my.aborted) {
        my.cancel();
        my.aborted = true;
        return { tag: "aborted" };
      }
      return prev;
    },
    cancel() {
    },
    start(...params: P) {
      trigger({ tag: "started", params });
    },
    thunk(...params: P) {
      return () => my.start(...params);
    },
    tearDown(prev: Event): Event {
      if (prev.tag === "started") {
        my.cancel();
        my.aborted = true;
      }
      return prev;
    }
  }).current;

  useEffect(function onStart() {
    if (event.tag === "started") {
      my.aborted = false;
      (async (round, params) => {
        try {
          let payload = await my.controller.run(...params);
          if (round === my.round && !my.aborted) {
            trigger({ tag: "fulfilled", payload });
          }
        } catch (reason) {
          if (round === my.round && !my.aborted) {
            trigger({ tag: "rejected", reason, params });
          }
        }
      })(++my.round, event.params);
      return () => trigger(my.tearDown);
    }
  }, [event, my]);

  return useMemo(() => ({
    start: my.start,
    thunk: my.thunk,
    when({ otherwise: _ = bottom, idle = _, busy = _, done = _, failed = _ }) {
      switch (event.tag) {
        case "idle":
          return idle();
        case "started":
          return busy(() => trigger(my.abort));
        case "fulfilled":
          return done(event.payload);
        case "rejected":
          return failed(event.reason, my.thunk(...event.params));
        case "aborted":
          return failed("aborted", pass);
      }
    }
  }), [event, my]);
}
