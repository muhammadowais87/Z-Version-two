import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const DashboardSkeleton = () => {
  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header Skeleton */}
      <div className="bg-gradient-vibrant text-primary-foreground p-6 rounded-b-3xl shadow-glow">
        <Skeleton className="h-8 w-48 mb-2 bg-white/20" />
        <Skeleton className="h-4 w-32 bg-white/20" />
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Wallet Balance Skeleton */}
        <div className="flex items-center justify-between gap-3">
          <Card className="flex-1 p-4 bg-gradient-success border-0">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <Skeleton className="h-3 w-24 mb-2 bg-white/30" />
                <Skeleton className="h-8 w-32 bg-white/30" />
              </div>
              <Skeleton className="w-10 h-10 rounded-full bg-white/30" />
            </div>
          </Card>
          <Skeleton className="h-[76px] w-[76px] rounded-md" />
        </div>

        {/* Whale Trade CTA Skeleton */}
        <Card className="bg-gradient-purple border-0">
          <CardHeader>
            <Skeleton className="h-6 w-40 mb-2 bg-white/30" />
            <Skeleton className="h-4 w-full bg-white/20" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-11 w-full bg-white/30" />
          </CardContent>
        </Card>

        {/* Stats Grid Skeleton */}
        <div className="grid grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-3 w-20 mb-2" />
              <Skeleton className="h-8 w-24 mb-1" />
              <Skeleton className="h-3 w-16" />
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-3 w-20 mb-2" />
              <Skeleton className="h-8 w-24" />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export const AITradeSkeleton = () => {
  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header Skeleton */}
      <div className="bg-gradient-vibrant text-primary-foreground p-6 rounded-b-3xl shadow-glow">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2 bg-white/20" />
            <Skeleton className="h-4 w-40 bg-white/20" />
          </div>
          <Skeleton className="h-10 w-10 rounded-md bg-white/20" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Wallet Balance Skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-10 w-40" />
          </CardContent>
        </Card>

        {/* Active Cycle / Cycle Selection Skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export const CycleHistorySkeleton = () => {
  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header Skeleton */}
      <div className="bg-gradient-vibrant text-primary-foreground p-6 rounded-b-3xl shadow-glow">
        <Skeleton className="h-8 w-48 mb-2 bg-white/20" />
        <Skeleton className="h-4 w-56 bg-white/20" />
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Stats Grid Skeleton */}
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-3 w-20 mb-2" />
              <Skeleton className="h-8 w-16" />
            </Card>
          ))}
        </div>

        {/* Cycle Cards Skeleton */}
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
              <Skeleton className="h-4 w-40" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Skeleton className="h-3 w-20 mb-1" />
                  <Skeleton className="h-6 w-24" />
                </div>
                <div>
                  <Skeleton className="h-3 w-20 mb-1" />
                  <Skeleton className="h-6 w-24" />
                </div>
              </div>
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
