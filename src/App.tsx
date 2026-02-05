import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "@/components/ProtectedRoute";
import PageLoader from "@/components/PageLoader";

// Lazy load pages for code splitting
const Landing = lazy(() => import("./pages/Landing"));
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Wallet = lazy(() => import("./pages/Wallet"));
const Team = lazy(() => import("./pages/Team"));
const Invite = lazy(() => import("./pages/Invite"));
const Profile = lazy(() => import("./pages/Profile"));
const FAQs = lazy(() => import("./pages/FAQs"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const InvestmentHistory = lazy(() => import("./pages/InvestmentHistory"));
const AITrade = lazy(() => import("./pages/AITrade"));
const CycleHistory = lazy(() => import("./pages/CycleHistory"));
const AdminCycles = lazy(() => import("./pages/AdminCycles"));
const WhaleWatch = lazy(() => import("./pages/WhaleWatch"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      gcTime: 1000 * 60 * 5, // 5 minutes garbage collection
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/wallet" element={<ProtectedRoute><Wallet /></ProtectedRoute>} />
            <Route path="/team" element={<ProtectedRoute><Team /></ProtectedRoute>} />
            <Route path="/invite" element={<ProtectedRoute><Invite /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
            <Route path="/admin-login" element={<AdminLogin />} />
            <Route path="/investment-history" element={<ProtectedRoute><InvestmentHistory /></ProtectedRoute>} />
            <Route path="/ai-trade" element={<ProtectedRoute><AITrade /></ProtectedRoute>} />
            <Route path="/cycle-history" element={<ProtectedRoute><CycleHistory /></ProtectedRoute>} />
            <Route path="/admin-cycles" element={<ProtectedRoute><AdminCycles /></ProtectedRoute>} />
            <Route path="/whale-watch" element={<ProtectedRoute><WhaleWatch /></ProtectedRoute>} />
            <Route path="/faqs" element={<FAQs />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
