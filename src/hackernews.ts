import axios from "axios";
import { Progress } from "./progress";

// https://github.com/HackerNews/API/blob/master/README.md

const api = axios.create({ baseURL: "https://hacker-news.firebaseio.com/v0/" });

export type Item = {
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

export type Comment = Item & {
  type: "comment";
  parent: number;
  text: string;
  kids: number[];
};

export type Job = Item & {
  type: "job";
  title: string;
  text: string;
  url: string;
  score: number;
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

export type Post = Story | Comment | Job | Poll | PollPart;

export type User = {
  id: string;
  created: number;
  karma: number;
  about: string;
  submitted: number[];
};

export async function getItem(
  this: Progress<[number, number]>,
  id: number
): Promise<Post> {
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

function withTimeout<P>(duration: number, promise: Promise<P>): Promise<P> {
  let deadline = new Promise<P>((_, err) => {
    setTimeout(() => err("timeout"), duration);
  });
  return Promise.race([deadline, promise]);
}

var top: number[] = [];

export async function getPage(
  this: Progress<(number | Story | Job)[]>,
  page: number,
  { pageSize = 25, forced = false } = {}
): Promise<(Story | Job)[]> {
  const sub = this.extend({ topStories, getItem });
  if (forced || !top.length) {
    top = await sub.topStories();
  }
  let start = page * pageSize;
  if (start >= top.length) {
    return [];
  }
  let pageIds = top.slice(start, start + pageSize);
  const partial = pageIds.map<number | Story | Job>(() => 0);
  this.post(partial);
  let requests = pageIds.map(async (id, i) => {
    let item = (await sub.getItem(id)) as Story | Job;
    partial[i] = item;
    this.post(partial);
    return item;
  });
  return withTimeout(10_000, Promise.all(requests));
}
