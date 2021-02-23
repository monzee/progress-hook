import { Log } from "./components";
import { getListing, Root } from "./hackernews";
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

function Row({ item }: { item: Root }) {
  return (
    <tr>
      {item.type === "story" && (
        <td className="meta">
          <big>{item.score}</big>
          <p>
            <a href="#">
              <small>{item.descendants} comment(s)</small>
            </a>
          </p>
        </td>
      )}
      <td {...(item.type === "job" ? { colSpan: 2, className: "ad" } : {})}>
        <h4>{item.title}</h4>
        <p>submitted by {item.by}</p>
      </td>
    </tr>
  );
}

export default function App() {
  const { start, when } = useProgressOf(getListing);
  return (
    <div className="App">
      {when({
        idle: () => {
          start();
          return NothingToShow();
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
            <NothingToShow />
          ),

        done: (result) => (
          <Log message={result}>
            <table className="listing">
              <tbody>
                <tr>
                  <td colSpan={2}>
                    <h1>Hacker News</h1>
                    <button
                      onClick={() => start(0, { forced: true, slowly: true })}
                    >
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
            <button onClick={() => start()}>start over</button>
          </Log>
        )
      })}
    </div>
  );
}
