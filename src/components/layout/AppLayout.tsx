import { Outlet } from "react-router-dom";

import { Sidebar } from "./Sidebar";

export function AppLayout() {
  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="mx-auto max-w-6xl p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
