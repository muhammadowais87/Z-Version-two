import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Zap, Star, Lock, CheckCircle, Circle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type ChanceStatus = 'available' | 'active' | 'locked' | 'completed' | 'disabled';

interface ChanceSelectorProps {
  chance1Status: ChanceStatus;
  chance2Status: ChanceStatus;
  activeChance: number | null;
  onSelectChance: (chance: number) => void;
  hasActiveCycle: boolean;
}

const getStatusIcon = (status: ChanceStatus) => {
  switch (status) {
    case 'active':
      return <Circle className="w-4 h-4 fill-green-500 text-green-500" />;
    case 'locked':
      return <Lock className="w-4 h-4 text-muted-foreground" />;
    case 'completed':
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'disabled':
      return <AlertTriangle className="w-4 h-4 text-destructive" />;
    default:
      return <Circle className="w-4 h-4 text-muted-foreground" />;
  }
};

const getStatusLabel = (status: ChanceStatus) => {
  switch (status) {
    case 'active':
      return 'Active';
    case 'locked':
      return 'Locked';
    case 'completed':
      return 'Completed';
    case 'disabled':
      return 'Disabled';
    default:
      return 'Available';
  }
};

const getStatusColor = (status: ChanceStatus) => {
  switch (status) {
    case 'active':
      return 'bg-green-500/10 border-green-500 text-green-700';
    case 'locked':
      return 'bg-muted border-muted-foreground/30 text-muted-foreground';
    case 'completed':
      return 'bg-green-100 border-green-500 text-green-700';
    case 'disabled':
      return 'bg-destructive/10 border-destructive text-destructive';
    default:
      return 'bg-primary/10 border-primary text-primary';
  }
};

export function ChanceSelector({ 
  chance1Status, 
  chance2Status, 
  activeChance, 
  onSelectChance,
  hasActiveCycle 
}: ChanceSelectorProps) {
  const bothUsed = (chance1Status === 'completed' || chance1Status === 'disabled') && 
                   (chance2Status === 'completed' || chance2Status === 'disabled');

  if (bothUsed) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardHeader className="text-center">
          <CardTitle className="text-destructive">No Chances Available</CardTitle>
          <CardDescription>
            You've used both chances. Please wait for the next reset to start again.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const canSelectChance = (status: ChanceStatus) => {
    return status === 'available' || status === 'active';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Choose Your Chance
        </CardTitle>
        <CardDescription>
          You have 2 chances to start a cycle. Only one can be active at a time.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        {/* Chance 1 */}
        <Button
          variant="outline"
          className={cn(
            "h-32 flex flex-col gap-2 transition-all relative",
            getStatusColor(chance1Status),
            canSelectChance(chance1Status) && "hover:scale-105",
            activeChance === 1 && "ring-2 ring-primary"
          )}
          onClick={() => canSelectChance(chance1Status) && onSelectChance(1)}
          disabled={!canSelectChance(chance1Status) || hasActiveCycle}
        >
          <div className="absolute top-2 right-2">
            {getStatusIcon(chance1Status)}
          </div>
          <div className="p-3 bg-background rounded-full">
            <Zap className="w-6 h-6 text-yellow-500" />
          </div>
          <span className="font-semibold">Chance 1</span>
          <Badge variant="outline" className="text-xs">
            {getStatusLabel(chance1Status)}
          </Badge>
        </Button>

        {/* Chance 2 */}
        <Button
          variant="outline"
          className={cn(
            "h-32 flex flex-col gap-2 transition-all relative",
            getStatusColor(chance2Status),
            canSelectChance(chance2Status) && "hover:scale-105",
            activeChance === 2 && "ring-2 ring-primary"
          )}
          onClick={() => canSelectChance(chance2Status) && onSelectChance(2)}
          disabled={!canSelectChance(chance2Status) || hasActiveCycle}
        >
          <div className="absolute top-2 right-2">
            {getStatusIcon(chance2Status)}
          </div>
          <div className="p-3 bg-background rounded-full">
            <Star className="w-6 h-6 text-purple-500" />
          </div>
          <span className="font-semibold">Chance 2</span>
          <Badge variant="outline" className="text-xs">
            {getStatusLabel(chance2Status)}
          </Badge>
        </Button>
      </CardContent>
    </Card>
  );
}
