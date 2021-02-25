import axios from "axios";
import { Progress } from "react-progress-hook";
import { delay, withTimeout } from "./support";

// https://github.com/HackerNews/API/blob/master/README.md

const api = axios.create({ baseURL: "https://hacker-news.firebaseio.com/v0/" });

type Item = {
  id: number;
  by: string;
  time: number;
  deleted?: boolean;
  dead?: boolean;
};

export type Story = Item & {
  type: "story";
  title: string;
  url: string;
  descendants: number;
  kids: number[];
  score: number;
};

export type Job = Item & {
  type: "job";
  title: string;
  text: string;
  url: string;
  score: number;
};

export type Comment = Item & {
  type: "comment";
  parent: number;
  text: string;
  kids: number[];
};

export type Poll = Item & {
  type: "poll";
  title: string;
  text: string;
  parts: number[];
  descendants: number;
  kids: number[];
  score: number;
};

export type PollPart = Item & {
  type: "pollopt";
  poll: number;
  text: string;
  score: number;
};

export type Root = Story | Job;
export type Node = Root | Comment | Poll | PollPart;

export type User = {
  id: string;
  created: number;
  karma: number;
  about: string;
  submitted: number[];
};

async function fetchItem(
  this: Progress<[got: number, total: number]>,
  id: number
): Promise<Node> {
  let response = await api.get(`item/${id}.json`, {
    cancelToken: new axios.CancelToken(this.onAbort),
    onDownloadProgress: (event: ProgressEvent) => {
      this.post([event.loaded, event.total]);
    }
  });
  return response.data;
}

type Listing = "top" | "best" | "new";

async function fetchListing(
  this: Progress<never>,
  which: Listing = "top"
): Promise<number[]> {
  let response = await api.get(`${which}stories.json`, {
    cancelToken: new axios.CancelToken(this.onAbort)
  });
  return response.data;
}

const cache: { [_ in Listing]: number[] } = {
  top: [],
  best: [],
  new: []
};

export async function fetchPage(
  this: Progress<(number | Root)[]>,
  page = 0,
  {
    pageSize = 25,
    forced = false,
    slowly = false,
    which = "top" as Listing
  } = {}
): Promise<Root[]> {
  const sub = this.extend({ fetchListing, fetchItem });
  const cached = cache[which];
  if (forced || !cached.length) {
    cached.splice(0, cached.length, ...(await sub.fetchListing(which)));
  }
  let start = page * pageSize;
  if (start >= cached.length) {
    return [];
  }
  let itemIds = cached.slice(start, start + pageSize);
  let remaining = pageSize;
  const lastIndex = pageSize - 1;
  const partial = [...itemIds] as (number | Root)[];
  this.post(partial);
  let requests = itemIds.map(async (id, i) => {
    if (slowly) {
      await delay(Math.floor((lastIndex - i) / 5) * 1_000);
      this.assertActive();
    }
    let item = (await sub.fetchItem(id)) as Root;
    if (--remaining) {
      partial[i] = item;
      this.post(partial);
    }
    return item;
  });
  return withTimeout(10_000, Promise.all(requests));
}
