import { ReactNode, useEffect } from "react";

export function Log({
  message,
  severity = "log",
  children
}: {
  message: any;
  severity?: "log" | "info" | "error";
  children?: ReactNode;
}) {
  useEffect(
    function logOnMount() {
      console[severity](message);
    },
    [severity, message]
  );
  return <>{children}</>;
}
