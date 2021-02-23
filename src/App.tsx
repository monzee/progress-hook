import { useMemo } from "react";
import { Log } from "./components";
import { getPage, Job, Story } from "./hackernews";
import { useProgressOf } from "./progress";
import "./styles.css";

function NothingToShow() {
  return (
    <table className="listing">
      <tbody>
        <tr>
          <td>
            <h1>Hacker News</h1>
            <button disabled={true}>stop me</button>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function Row(props: { item: Story | Job }) {
  const { item } = props;
  return (
    <tr>
      <td className="meta">
        <big>{item.score}</big>
        {item.type === "story" && (
          <p>
            <a href="javascript:void 0">
              <small>{item.descendants} comment(s)</small>
            </a>
          </p>
        )}
      </td>
      <td>
        <h4>{item.title}</h4>
        <p>submitted by {item.by}</p>
      </td>
    </tr>
  );
}

export default function App() {
  const { start, when } = useProgressOf(getPage);
  const header = useMemo(NothingToShow, []);
  return (
    <div className="App">
      {when({
        idle: () => {
          start(0);
          return header;
        },

        busy: (abort, partial) =>
          partial ? (
            <table className="listing">
              <tbody>
                <tr>
                  <td colSpan={2}>
                    <h1>Hacker News</h1>
                    <button onClick={abort}>stop me</button>
                  </td>
                </tr>
                {partial.map((item, i) =>
                  typeof item === "number" ? (
                    <tr key={i}>
                      <td colSpan={2}>fetching row</td>
                    </tr>
                  ) : (
                    <Row item={item} key={item.id} />
                  )
                )}
              </tbody>
            </table>
          ) : (
            header
          ),

        done: (result) => (
          <Log message={result}>
            <table className="listing">
              <tbody>
                <tr>
                  <td colSpan={2}>
                    <h1>Hacker News</h1>
                    <button onClick={() => start(0, { forced: true })}>
                      refresh
                    </button>
                  </td>
                </tr>
                {result.map((item) => (
                  <Row item={item} key={item.id} />
                ))}
              </tbody>
            </table>
          </Log>
        ),

        failed: (reason) => (
          <Log message={reason} severity="error">
            <h1>ERROR!</h1>
            <p>please see console</p>
          </Log>
        )
      })}
    </div>
  );
}
