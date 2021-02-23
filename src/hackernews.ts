import axios from "axios";
import { Progress } from "./progress";

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

export async function getItem(
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

export async function topStories(this: Progress<never>): Promise<number[]> {
  let response = await api.get("topstories.json", {
    cancelToken: new axios.CancelToken(this.onAbort)
  });
  return response.data;
}

function withTimeout<P>(maxDuration: number, promise: Promise<P>): Promise<P> {
  let deadline = new Promise<P>((_, err) => {
    setTimeout(() => err("timeout"), maxDuration);
  });
  return Promise.race([deadline, promise]);
}

function delay(duration: number): Promise<void> {
  return new Promise((ok) => setTimeout(ok, duration));
}

type Listing = "top" | "best" | "new";

var top: number[] = [];

export async function getListing(
  this: Progress<(number | Root)[]>,
  page = 0,
  {
    pageSize = 25,
    forced = false,
    slowly = false,
    which = "top" as Listing
  } = {}
): Promise<Root[]> {
  const sub = this.extend({ topStories, getItem });
  if (forced || !top.length) {
    top = await sub.topStories();
  }
  let start = page * pageSize;
  if (start >= top.length) {
    return [];
  }
  let pageIds = top.slice(start, start + pageSize);
  const partial = pageIds.map<number | Root>(() => 0);
  const lastIndex = partial.length - 1;
  this.post(partial);
  let requests = pageIds.reverse().map(async (id, i) => {
    let item = (await sub.getItem(id)) as Root;
    if (slowly) {
      await delay(1000);
    }
    partial[lastIndex - i] = item;
    this.post(partial);
    return item;
  });
  let roots = await withTimeout(10_000, Promise.all(requests));
  return roots.reverse();
}
