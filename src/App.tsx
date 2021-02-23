import { ReactNode } from "react";
import { Log } from "./components";
import { fetchPage, Root } from "./hackernews";
import { useProgressOf } from "./progress";
import "./styles.css";

function Listing({
  action,
  label = "stop me",
  children
}: {
  action?(): void;
  label?: string;
  children?: ReactNode;
}) {
  return (
    <table className="listing">
      <tbody>
        <tr>
          <td colSpan={2}>
            <h1>Hacker News</h1>
            <button disabled={!action} onClick={action}>
              {label}
            </button>
          </td>
        </tr>
        {children}
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
  const { start, when } = useProgressOf(fetchPage);
  return (
    <div className="App">
      {when({
        idle: () => {
          start();
          return <Listing />;
        },

        busy: (abort, partial) => (
          <Listing action={partial && abort}>
            {partial?.map((item, i) =>
              typeof item === "number" ? (
                <tr key={i}>
                  <td colSpan={2}>fetching row</td>
                </tr>
              ) : (
                <Row item={item} key={item.id} />
              )
            )}
          </Listing>
        ),

        done: (result) => (
          <Log message={result}>
            <Listing
              action={() => start(0, { forced: true, slowly: true })}
              label="refresh slowly"
            >
              {result.map((item) => (
                <Row item={item} key={item.id} />
              ))}
            </Listing>
          </Log>
        ),

        failed: (reason) => (
          <Log message={reason} severity="error">
            <h1>ERROR!</h1>
            <p>please see console</p>
            <button onClick={() => start(0, { forced: true })}>
              start over
            </button>
          </Log>
        )
      })}
    </div>
  );
}
