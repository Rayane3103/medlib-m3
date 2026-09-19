import { createHashRouter, RouterProvider } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { UpdaterProvider } from "@/components/updater/UpdaterProvider";
import { Dashboard } from "@/pages/Dashboard";
import { Placeholder } from "@/pages/Placeholder";
import { Pos } from "@/pages/Pos";
import { Products } from "@/pages/Products";
import { Purchases } from "@/pages/Purchases";
import { Settings } from "@/pages/Settings";
import { Stock } from "@/pages/Stock";

const router = createHashRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Pos /> },
      { path: "dashboard", element: <Dashboard /> },
      { path: "products", element: <Products /> },
      { path: "stock", element: <Stock /> },
      { path: "purchases", element: <Purchases /> },
      {
        path: "customers",
        element: (
          <Placeholder
            title="Clients"
            description="Clients facultatifs liés aux ventes."
            step="l'étape 5 (Clients)"
          />
        ),
      },
      {
        path: "reports",
        element: (
          <Placeholder
            title="Rapports"
            description="Ventes, achats et bénéfices."
            step="l'étape 6 (Tableau de bord + Rapports)"
          />
        ),
      },
      {
        path: "expenses",
        element: (
          <Placeholder
            title="Dépenses"
            description="Dépenses de la boutique par date."
            step="l'étape 7 (Dépenses)"
          />
        ),
      },
      { path: "settings", element: <Settings /> },
    ],
  },
]);

export default function App() {
  return (
    <UpdaterProvider>
      <RouterProvider router={router} />
    </UpdaterProvider>
  );
}
