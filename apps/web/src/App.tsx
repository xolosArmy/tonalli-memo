import { Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { FeedRoute } from "./routes/FeedRoute";
import { NotFoundRoute } from "./routes/NotFoundRoute";
import { TransactionRoute } from "./routes/TransactionRoute";

export function App(): React.JSX.Element {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<FeedRoute />} />
        <Route path="tx/:txid" element={<TransactionRoute />} />
        <Route path="*" element={<NotFoundRoute />} />
      </Route>
    </Routes>
  );
}
