import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";

type Props = {
  title: string;
  description: string;
  step: string;
};

/**
 * Temporary page shown for features that are documented but not built yet.
 * Each feature is implemented in its own numbered step (see README).
 */
export function Placeholder({ title, description, step }: Props) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <p className="text-sm font-medium">Pas encore disponible</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Cet écran fait partie de {step}. La base (base de données, navigation,
            couche de commandes Rust) est en place et prête à l'accueillir.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
