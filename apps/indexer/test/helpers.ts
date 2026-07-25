import { openIndexerDatabase, MemoStore, type IndexerClock } from "../src/index.js";

export const fakeClock = (values: readonly number[]): IndexerClock => {
  let index = 0;
  return {
    nowSeconds() {
      const value = values[index];
      if (value === undefined) {
        throw new Error("Fake clock exhausted.");
      }
      index += 1;
      return value;
    }
  };
};

export function openStore() {
  const database = openIndexerDatabase({ filename: ":memory:" });
  return {
    database,
    store: new MemoStore(database)
  };
}
