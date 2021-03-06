import { useEffect, useMemo, useRef, useState } from "react";
import { bottom, pass, Sum } from "./support";

/**
 * Async function wrapper that allows starting, aborting, retrying and
 * progress reporting.
 */
export type Task<P extends any[], S, T> = {
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
   * @param callback Will be invoked when `abort()` is called while busy.
   */
  onAbort(callback: () => void): void;

  /**
   * Sets the task's current status in the busy state.
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
 * The object changes everytime its internal state changes (in sync with the
 * {@link Task.when} function), but its {@link Task.start} function is stable.
 *
 * @see Task
 * @see Progress
 */
export function useProgressOf<P extends any[], S, T>(
  run: (this: Progress<S>, ...params: P) => Promise<T>
): Task<P, S, T> {
  type State =
    | { tag: "idle" }
    | { tag: "started"; params: P }
    | { tag: "pending"; status: S }
    | { tag: "resolved"; payload: T }
    | { tag: "rejected"; reason: any; params: P }
    | { tag: "aborted" };

  const [state, dispatch] = useState<State>({ tag: "idle" });
  const my = useRef({
    aborted: false,
    calls: 0,
    cancellers: [] as (() => void)[],

    cleanUp() {
      for (let cancel of my.cancellers) {
        cancel();
      }
      my.cancellers.length = 0;
    },

    newContext() {
      const round = ++my.calls;
      function isActive() {
        return round === my.calls && !my.aborted;
      }
      return {
        run,
        isActive,
        assertActive() {
          if (!isActive()) {
            throw new Error("Task abandoned.");
          }
        },
        onAbort(callback: () => void) {
          my.cancellers.push(callback);
        },
        post(status: S) {
          dispatch({ tag: "pending", status });
        }
      };
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
      dispatch({ tag: "started", params });
    },

    tearDown() {
      dispatch((state) => {
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
      my.cleanUp();
      my.aborted = false;
      (async (context, params) => {
        try {
          let payload = await context.run(...params);
          if (context.isActive()) {
            my.cancellers.length = 0;
            dispatch({ tag: "resolved", payload });
          }
        } catch (reason) {
          if (context.isActive()) {
            my.cancellers.length = 0;
            dispatch({ tag: "rejected", reason, params });
          }
        }
      })(my.newContext(), state.params);
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

type Thread = { id: number; title: string };
declare function getThreadIds(page: number): Promise<number[]>;
declare function getThread(this: Progress<any>, id: number): Promise<Thread>;

function useImagination() {
  const getPage = useProgressOf(async function (
    this: Progress<(Thread | false)[]>,
    page: number
  ): Promise<Thread[]> {
    let ids = await getThreadIds(page);
    let partial = ids.map<Thread | false>(() => false);
    let self = Object.assign({ getThread }, this);
    self.post(partial);
    let threads = Promise.all(ids.map(async (id, i) => {
      self.assertActive();
      let thread = await self.getThread(id);
      partial[i] = thread;
      self.post(partial);
      return thread;
    }));
    let timeout = new Promise<any>((_, reject) => {
      setTimeout(() => reject("timeout"), 10000);
    });
    return Promise.race([timeout, threads]);
  });
  getPage.when({
    idle: () => getPage.start(0),
    busy: (abort, partial) => {
      if (partial) {
        let count = partial.filter((t) => !!t).length;
        let total = partial.length;
        console.info(`${count / total * 100 | 0}% done [${count} / ${total}]`);
      }
    },
    done: console.log,
    failed: console.error,
  });
}