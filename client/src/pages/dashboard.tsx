import { useQuery } from "@tanstack/react-query";
import {
  DollarSign,
  ClipboardList,
  FolderKanban,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import type { DashboardStats, SpendByProject, MonthlySpendTrend, RenewalAlert } from "@shared/schema";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  compact,
}: {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ElementType;
  compact?: boolean;
}) {
  return (
    <Card>
      <CardContent className={compact ? "flex items-center gap-3 p-4" : "p-4"}>
        {compact ? (
          <>
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{title}</p>
              <p className="text-lg font-bold leading-tight">{value}</p>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-xs font-medium text-muted-foreground">{title}</p>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-lg font-bold">{value}</div>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

const CHART_COLORS = ["hsl(217, 91%, 60%)", "hsl(142, 71%, 45%)", "hsl(262, 83%, 58%)", "hsl(43, 96%, 56%)", "hsl(0, 84%, 60%)"];

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: spendByProject, isLoading: spendLoading } = useQuery<SpendByProject[]>({
    queryKey: ["/api/dashboard/spend-by-project"],
  });

  const { data: monthlyTrend, isLoading: trendLoading } = useQuery<MonthlySpendTrend[]>({
    queryKey: ["/api/dashboard/monthly-trend"],
  });

  const { data: renewalAlerts, isLoading: alertsLoading } = useQuery<RenewalAlert[]>({
    queryKey: ["/api/dashboard/renewal-alerts"],
  });

  if (statsLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Executive overview of your equipment rentals</p>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Monthly Rate"
          value={formatCurrency(stats?.totalMonthlySpend || 0)}
          icon={DollarSign}
          compact
        />
        <StatCard
          title="Total Cost to Date"
          value={formatCurrency(stats?.totalCostToDate || 0)}
          icon={TrendingUp}
          compact
        />
        <StatCard
          title="Active Rentals"
          value={stats?.activeRentalsCount || 0}
          icon={ClipboardList}
          compact
        />
        <StatCard
          title="Active Projects"
          value={stats?.projectsCount || 0}
          icon={FolderKanban}
          compact
        />
      </div>

      {(stats?.renewalsDueSoon || 0) > 0 && (
        <Card className="border-orange-500/50 bg-orange-500/5">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500/10 shrink-0">
              <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Renewals Due Within 7 Days</p>
              <p className="text-xs text-muted-foreground">
                {stats?.renewalsDueSoon} equipment rental{(stats?.renewalsDueSoon || 0) > 1 ? "s" : ""} approaching renewal
              </p>
            </div>
            <Badge variant="destructive" data-testid="badge-renewals-count">
              {stats?.renewalsDueSoon}
            </Badge>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Monthly Spend Trend
            </CardTitle>
            <CardDescription>Last 6 months of equipment rental costs</CardDescription>
          </CardHeader>
          <CardContent>
            {trendLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={monthlyTrend || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number) => [formatCurrency(value), "Spend"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="spend"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))", strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Projects by Cost to Date</CardTitle>
            <CardDescription>Accumulated equipment rental costs by project</CardDescription>
          </CardHeader>
          <CardContent>
            {spendLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : spendByProject && spendByProject.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={spendByProject.slice(0, 5)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    type="number"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                  />
                  <YAxis
                    type="category"
                    dataKey="projectCode"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number) => [formatCurrency(value), "Cost to Date"]}
                  />
                  <Bar dataKey="costToDate" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                No project data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cost Distribution</CardTitle>
            <CardDescription>Accumulated equipment costs by project</CardDescription>
          </CardHeader>
          <CardContent>
            {spendLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : spendByProject && spendByProject.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={spendByProject.slice(0, 5)}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="costToDate"
                    nameKey="projectCode"
                    label={({ projectCode, percent }) =>
                      `${projectCode} (${(percent * 100).toFixed(0)}%)`
                    }
                    labelLine={false}
                  >
                    {spendByProject.slice(0, 5).map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number) => [formatCurrency(value), "Spend"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Renewal Alerts
              </CardTitle>
              <CardDescription>Contracts due for renewal soon</CardDescription>
            </div>
            <Link href="/rentals" className="text-sm text-primary hover:underline" data-testid="link-view-all-rentals">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {alertsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : renewalAlerts && renewalAlerts.length > 0 ? (
              <div className="space-y-3">
                {renewalAlerts.slice(0, 5).map((alert) => (
                  <div
                    key={alert.rentalId}
                    className="flex items-center justify-between p-3 rounded-md bg-muted/50"
                  >
                    <div>
                      <p className="font-medium text-sm">{alert.equipmentName}</p>
                      <p className="text-xs text-muted-foreground">{alert.projectName}</p>
                    </div>
                    <Badge
                      variant={
                        alert.daysUntilRenewal <= 7
                          ? "destructive"
                          : alert.daysUntilRenewal <= 14
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {alert.daysUntilRenewal <= 0
                        ? "Overdue"
                        : `${alert.daysUntilRenewal} days`}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                No upcoming renewals
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
