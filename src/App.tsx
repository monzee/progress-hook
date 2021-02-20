import { Log } from "./components";
import { useAppModel } from "./model";
import "./styles.css";

export default function App() {
  const { reset, match } = useAppModel();
  return (
    <div className="App">
      <h1>Hello CodeSandbox</h1>
      <Log message="HELLO" severity="info" />
      {match({
        loading: (abort) => (
          <>
            <p>please wait...</p>
            <button onClick={abort} disabled={!abort}>
              stop
            </button>
          </>
        ),

        loaded: (items) => (
          <>
            <ul>
              {items.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
            <button onClick={reset}>again</button>
          </>
        ),

        failed: (cause) => (
          <Log message={cause} severity="error">
            <h4>error!</h4>
            <p>please see console</p>
            <button onClick={reset}>again</button>
          </Log>
        )
      })}
    </div>
  );
}
