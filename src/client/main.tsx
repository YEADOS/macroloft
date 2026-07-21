import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router";
import App from "./App";
import "./styles.css";

const theme =
  new URLSearchParams(location.search).get("theme") ?? localStorage.getItem("theme");
if (theme === "light" || theme === "dark")
  document.documentElement.dataset.theme = theme;

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
