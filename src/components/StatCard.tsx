import { LucideIcon } from "lucide-react";
import { Card } from "./ui/card";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  trend?: string;
  variant?: "default" | "success";
}

const StatCard = ({ icon: Icon, label, value, trend, variant = "default" }: StatCardProps) => {
  return (
    <Card className="group p-4 hover:shadow-glow transition-all duration-300 hover:scale-105 cursor-pointer border-2 hover:border-primary/50 bg-gradient-to-br from-card to-card/50">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground mb-1 font-medium">{label}</p>
          <p className={`text-2xl font-bold transition-colors duration-300 ${
            variant === "success" 
              ? "text-success group-hover:text-success-glow" 
              : "text-foreground group-hover:text-primary"
          }`}>
            {value}
          </p>
          {trend && (
            <p className="text-xs text-success mt-1 font-semibold animate-pulse">{trend}</p>
          )}
        </div>
        <div className={`p-3 rounded-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-6 ${
          variant === "success" 
            ? "bg-gradient-to-br from-success/20 to-success/10" 
            : "bg-gradient-to-br from-primary/20 to-primary/10"
        }`}>
          <Icon className={`w-5 h-5 transition-colors duration-300 ${
            variant === "success" 
              ? "text-success group-hover:text-success-glow" 
              : "text-primary group-hover:text-primary-glow"
          }`} />
        </div>
      </div>
    </Card>
  );
};

export default StatCard;
