import { useEffect, useMemo, useRef, useState } from "react";
import { bottom, pass, Sum } from "./support";

/**
 * Async function wrapper that allows starting, aborting, retrying and
 * progress reporting.
 */
export type Task<P extends any[], T, S> = {
  /**
   * Starts the task.
   *
   * This function is stable. It will never cause a hook to be recomputed
   * when used as a dependency.
   */
  start(...params: P): void;

  /**
   * Invokes the branch that corresponds to the current state of the task.
   *
   * Non-stable; will change whenever the internal state changes, namely:
   * - after calling `Task.start(...P)` (* -> busy `undefined`)
   * - after every call to `Progress.post(S)` by the producer (busy S? -> busy S)
   * - after calling `abort()` (busy S? -> failed `"aborted"`)
   * - when the producer finishes and returns a value (busy S? -> done T)
   * - when the producer throws an error (busy S? -> failed Error)
   */
  when: Sum<{
    /** The task has not been started yet. */
    idle: [];

    /**
     * The task is currently running.
     *
     * @param abort Cancels the task.
     * @param status The last value posted by the task.
     *
     * This is `undefined` the first time this branch is matched
     * (right after starting). After that, this branch will be matched
     * as many times as `this.post(status)` is called by the task.
     */
    busy: [abort: () => void, status?: S];

    /**
     * The task completed successfully.
     *
     * @param result The value returned by the producer.
     */
    done: [result: T];

    /**
     * The task threw or the consumer aborted the task.
     *
     * @param reason The value thrown by the producer.
     * `"aborted"` if the task was aborted by the consumer while busy.
     * @param retry Re-runs the producer with the same parameters.
     * Does nothing if the task was aborted by the consumer while busy.
     */
    failed: [reason: any, retry: () => void]
  }>
}

/**
 * Provides methods to the producer to post status updates and get notified
 * when the consumer aborts the task.
 */
export type Progress<S> = {
  /**
   * @param cleanUp Will be invoked when `abort()` is called while busy.
   */
  onAbort(cleanUp: () => void): void;

  /**
   * Sets the task's current status in the busy state.
   *
   * @param status The value to be sent to the consumer's `busy` branch.
   * Causes a re-render even if the value is the same as the previous one.
   */
  post(status: S): void;

  /**
   * Halts the task if the consumer has called `abort()` during the busy state.
   *
   * Call this once in a while to prevent doing unnecessary work that the
   * consumer will never see.
   */
  returnWhenAborted(): void;
}

/**
 * Creates a task from an async function.
 *
 * @param run The producer function.
 *
 * This function is treated as stable even when it's not (otherwise, the
 * {@link Task.start} function cannot be stable). If the closure captures
 * state from its context, only the values during the initial render are
 * seen. Rather than capturing stateful values, declare them as parameters
 * instead and restart the task when they change.
 *
 * @returns A non-stable task object.
 *
 * The object changes everytime its internal state changes (in sync with the
 * {@link Task.when} function), but its {@link Task.start} function is stable.
 *
 * @see Task
 * @see Progress
 */
export function useProgressOf<P extends any[], T, S>(
  run: (this: Progress<S>, ...params: P) => Promise<T>
): Task<P, T, S> {
  type State =
    | { tag: "idle" }
    | { tag: "started"; params: P }
    | { tag: "pending"; status: S }
    | { tag: "resolved"; payload: T }
    | { tag: "rejected"; reason: any; params: P}
    | { tag: "aborted" };

  const [state, dispatch] = useState<State>({ tag: "idle" });
  const my = useRef({
    aborted: false,
    cleanUp: pass,
    controller: {
      run,
      onAbort(cleanUp: () => any) {
        my.cleanUp = cleanUp;
      },
      post(status: S) {
        dispatch({ tag: "pending", status });
      },
      returnWhenAborted() {
        if (my.aborted) {
          throw new Error("already aborted");
        }
      }
    },
    abort() {
      dispatch((prev) => {
        if (!my.aborted) {
          my.cleanUp();
          my.aborted = true;
          return { tag: "aborted" };
        }
        return prev;
      });
    },
    start(...params: P) {
      // TODO: prevent overlap here? in the effect block? both?
      dispatch({ tag: "started", params });
    },
    tearDown() {
      dispatch(() => {
        if (state.tag === "started") {
          my.cleanUp();
          my.aborted = true;
        }
        return state;
      });
    }
  }).current;

  useEffect(function onStart() {
    if (state.tag === "started") {
      (async (params) => {
        try {
          my.aborted = false;
          let payload = await my.controller.run(...params);
          if (!my.aborted) {
            dispatch({ tag: "resolved", payload });
          }
        } catch (reason) {
          if (!my.aborted) {
            dispatch({ tag: "rejected", reason, params });
          }
        }
      })(state.params);
      return my.tearDown;
    }
  }, [my, state]);

  return useMemo(() => ({
    start: my.start,
    when({ otherwise: _ = bottom, idle = _, busy = _, done = _, failed = _ }) {
      switch (state.tag) {
        case "idle":
          return idle();
        case "started":
          return busy(my.abort);
        case "pending":
          return busy(my.abort, state.status);
        case "resolved":
          return done(state.payload);
        case "rejected":
          return failed(state.reason, () => my.start(...state.params));
        case "aborted":
          return failed("aborted", pass);
      }
    }
  }), [my, state]);
}

function useImagination() {
  const count = useProgressOf(async function (this: Progress<boolean>, n: number) {
    let handle = -1;
    this.onAbort(() => handle !== -1 && clearTimeout(handle));
    for (let i = 1; i <= n; i++) {
      this.returnWhenAborted();
      this.post(i % 5 === 0);
      await new Promise(ok => handle = setTimeout(ok, 1000));
    }
    return "foo";
  });
  count.when({
    idle: () => count.start(10),
    busy: (abort, status) => {
      if (status) abort();
    },
    otherwise: console.log,
  });
}