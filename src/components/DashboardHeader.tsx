
import { Button } from "@/components/ui/button";
import { Plus, Download, Info } from "lucide-react";

interface DashboardHeaderProps {
  onShowDetails: () => void;
}

export function DashboardHeader({ onShowDetails }: DashboardHeaderProps) {
  return (
    <div className="flex-1 flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Track and manage your subscriptions</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onShowDetails}>
          <Info className="h-4 w-4 mr-2" />
          Details
        </Button>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Subscription
        </Button>
      </div>
    </div>
  );
}
