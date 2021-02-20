import { useRunner } from "./runner";
import { pass, randomInt, Sum } from "./support";

export type AppModel = {
  reset(): void;
  match: Sum<{
    loading: [abort?: () => void];
    loaded: [items: string[]];
    failed: [error: any];
  }>;
};

export type Source = {
  pull(): Promise<string[]>;
};

const fakeSource: Source = {
  async pull() {
    await new Promise((ok) => setTimeout(ok, 1500));
    let n = randomInt(6);
    if (n === 0) {
      throw new Error("unlucky");
    }
    return Array.from({ length: n }, () => "" + randomInt(1, n + 1));
  }
};

export function useAppModel(src: Source = fakeSource): AppModel {
  const pull = useRunner(async function () {
    this.onAbort(() => console.log("stop!"));
    return src.pull();
  });
  return {
    reset() {
      pull.start();
    },
    match({ otherwise: _ = pass, loading = _, loaded = _, failed = _ }) {
      return pull.when({
        idle() {
          console.log("i heard this is guaranteed to be called only once. is it true?");
          pull.start();
          return loading();
        },
        busy(abort) {
          console.log("i'm busy.");
          return loading(abort);
        },
        done: loaded,
        failed
      });
    }
  };
}
