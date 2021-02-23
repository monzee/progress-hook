import { useEffect, useMemo, useRef, useState } from "react";
import { bottom, pass, Sum } from "./support";

/**
 * Async function wrapper that allows starting, aborting, retrying and
 * progress reporting.
 */
export type Task<S, P extends any[], T> = {
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
    failed: [reason: any, retry: () => void];
  }>
}

/**
 * Provides methods to the producer to post status updates and get notified
 * when the consumer aborts the task.
 */
export type Progress<S> = {
  /**
   * Halts if the task has been abandoned.
   *
   * A task is abandoned when the consumer calls `abort()` or
   * `Task.start(...P)` during the busy state. Call this once in a while
   * to prevent doing unnecessary work that the consumer will never see.
   */
  assertActive(): void;

  /**
   * @param aux Must be an object literal with at least one method.
   * @returns The same object with a copy of this context's properties.
   *
   * This is for composing subproducers that require a `Progress`
   * context. The resulting object has a `post` function that takes `any`
   * and does nothing, making it usable by any subproducer. All status
   * objects posted by the subproducers are dropped and never seen
   * by the consumer, but the cancellation facilities work as usual and
   * are tied to the status of this task.
   */
  extend<A extends object>(aux: Exclude<A, Function|any[]>): A & Progress<any>;

  /**
   * @param callback Will be invoked when `abort()` is called while busy.
   */
  onAbort(callback: () => void): void;

  /**
   * Sets the task's current status in the busy state if the task hasn't
   * been abandoned yet.
   *
   * @param status The value to be sent to the consumer's `busy` branch.
   * Causes a re-render even if the value is the same as the previous one.
   */
  post(status: S): void;
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
 * This object changes everytime its internal state changes (in sync with the
 * {@link Task.when} function), but its {@link Task.start} function is stable.
 *
 * @see Task
 * @see Progress
 */
export function useProgressOf<S, P extends any[], T>(
  run: (this: Progress<S>, ...params: P) => Promise<T>
): Task<S, P, T> {
  type State =
    | { tag: "idle" }
    | { tag: "started"; params: P }
    | { tag: "pending"; status: S }
    | { tag: "resolved"; payload: T }
    | { tag: "rejected"; reason: any; params: P }
    | { tag: "aborted" };

  const [state, dispatch] = useState<State>({ tag: "idle" });
  const My = useRef({
    aborted: false,
    calls: 0,
    cancellers: [] as (() => void)[],

    cleanUp() {
      for (let cancel of My.cancellers) {
        cancel();
      }
      My.cancellers.length = 0;
    },

    async run(params: P) {
      const round = ++My.calls;
      const job = {
        run,
        isActive() {
          return round === My.calls && !My.aborted;
        },
        assertActive() {
          if (!job.isActive()) {
            throw new Error("Task abandoned.");
          }
        },
        extend<A>(sub: A): A & Progress<void> {
          return Object.assign(sub, job, { post: job.assertActive });
        },
        onAbort(callback: () => void) {
          My.cancellers.push(callback);
        },
        post(status: S) {
          job.assertActive();
          dispatch({ tag: "pending", status });
        }
      };

      try {
        let payload = await job.run(...params);
        if (job.isActive()) {
          My.cancellers.length = 0;
          dispatch({ tag: "resolved", payload });
        }
      } catch (reason) {
        if (job.isActive()) {
          My.cancellers.length = 0;
          dispatch({ tag: "rejected", reason, params });
        }
      }
    },

    abort() {
      dispatch((prev) => {
        if (!My.aborted) {
          My.cleanUp();
          My.aborted = true;
          return { tag: "aborted" };
        }
        return prev;
      });
    },

    start(...params: P) {
      dispatch({ tag: "started", params });
    },

    tearDown() {
      dispatch((state) => {
        if (state.tag === "started") {
          My.cleanUp();
          My.aborted = true;
        }
        return state;
      });
    }
  }).current;

  useEffect(function onStart() {
    if (state.tag === "started") {
      My.cleanUp();
      My.aborted = false;
      My.run(state.params);
      return My.tearDown;
    }
  }, [My, state]);

  return useMemo(() => ({
    start: My.start,
    when({ otherwise: _ = bottom, idle = _, busy = _, done = _, failed = _ }) {
      switch (state.tag) {
        case "idle":
          return idle();
        case "started":
          return busy(My.abort);
        case "pending":
          return busy(My.abort, state.status);
        case "resolved":
          return done(state.payload);
        case "rejected":
          return failed(state.reason, () => My.start(...state.params));
        case "aborted":
          return failed("aborted", pass);
      }
    }
  }), [My, state]);
}