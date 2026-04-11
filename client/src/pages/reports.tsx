import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  FileText,
  BarChart3,
  Calendar,
  Building2,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Project, Rental, Invoice } from "@shared/schema";

function formatCurrency(amount: string | number | null): string {
  if (!amount) return "$0";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(num);
}

function downloadCSV(data: any[], filename: string) {
  if (data.length === 0) return;
  
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(","),
    ...data.map((row) =>
      headers.map((h) => {
        const value = row[h];
        if (value === null || value === undefined) return "";
        if (typeof value === "string" && (value.includes(",") || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(",")
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

export default function Reports() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedProject, setSelectedProject] = useState<string>("all");

  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: rentals, isLoading: rentalsLoading } = useQuery<Rental[]>({
    queryKey: ["/api/rentals"],
  });

  const { data: invoices, isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const isLoading = projectsLoading || rentalsLoading || invoicesLoading;

  const filteredRentals = rentals?.filter((rental) => {
    const matchesProject = selectedProject === "all" || rental.projectId === selectedProject;
    const startDate = new Date(rental.rentalStartDate);
    const matchesDateFrom = !dateFrom || startDate >= new Date(dateFrom);
    const matchesDateTo = !dateTo || startDate <= new Date(dateTo);
    return matchesProject && matchesDateFrom && matchesDateTo;
  }) || [];

  const filteredInvoices = invoices?.filter((invoice) => {
    const matchesProject = selectedProject === "all" || invoice.projectId === selectedProject;
    const invoiceDate = new Date(invoice.invoiceDate);
    const matchesDateFrom = !dateFrom || invoiceDate >= new Date(dateFrom);
    const matchesDateTo = !dateTo || invoiceDate <= new Date(dateTo);
    return matchesProject && matchesDateFrom && matchesDateTo;
  }) || [];

  const totalMonthlySpend = filteredRentals
    .filter((r) => r.status === "active")
    .reduce((sum, r) => sum + parseFloat(r.monthlyCost), 0);

  const totalInvoiced = filteredInvoices.reduce(
    (sum, inv) => sum + (inv.amount ? parseFloat(inv.amount) : 0),
    0
  );

  const calculateRentalCostToDate = (rental: Rental): number => {
    const monthlyCost = parseFloat(rental.monthlyCost);
    const startDate = new Date(rental.rentalStartDate + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let endDate: Date;
    if (rental.isOpenContract && rental.contractClosedDate) {
      endDate = new Date(rental.contractClosedDate + "T00:00:00");
    } else if (rental.isOpenContract) {
      endDate = today;
    } else if (rental.returnDate) {
      endDate = new Date(rental.returnDate + "T00:00:00");
    } else {
      endDate = today;
    }

    if (endDate < startDate) return 0;

    const renewalDay = startDate.getDate();
    let renewalCount = 0;
    let checkDate = new Date(startDate);

    while (true) {
      const nextMonth = checkDate.getMonth() + 1;
      const nextYear = checkDate.getFullYear() + (nextMonth > 11 ? 1 : 0);
      const normalizedMonth = nextMonth % 12;
      const daysInNextMonth = new Date(nextYear, normalizedMonth + 1, 0).getDate();
      const actualDay = Math.min(renewalDay, daysInNextMonth);
      const nextRenewal = new Date(nextYear, normalizedMonth, actualDay);

      if (nextRenewal <= endDate) {
        renewalCount++;
        checkDate = nextRenewal;
      } else {
        break;
      }
    }

    const baseCost = renewalCount * monthlyCost;
    const pickup = parseFloat(rental.pickupCost || "0");
    const dropoff = rental.contractClosedDate || rental.returnDate ? parseFloat(rental.dropoffCost || "0") : 0;
    const misc = parseFloat(rental.miscCost || "0");
    const subtotal = baseCost + pickup + dropoff + misc;
    const taxPercent = parseFloat(rental.taxPercent || "0");
    const tax = subtotal * (taxPercent / 100);

    return subtotal + tax;
  };

  const projectSummary = projects?.map((project) => {
    const projectRentals = filteredRentals.filter((r) => r.projectId === project.id);
    const activeRentals = projectRentals.filter((r) => r.status === "active");
    const monthlySpend = activeRentals.reduce((sum, r) => sum + parseFloat(r.monthlyCost), 0);
    const costToDate = projectRentals.reduce((sum, r) => sum + calculateRentalCostToDate(r), 0);
    const openContracts = projectRentals.filter((r) => r.isOpenContract && !r.contractClosedDate).length;
    const projectInvoices = filteredInvoices.filter((i) => i.projectId === project.id);
    const totalInvoiced = projectInvoices.reduce(
      (sum, inv) => sum + (inv.amount ? parseFloat(inv.amount) : 0),
      0
    );

    return {
      id: project.id,
      code: project.code,
      name: project.name,
      status: project.status,
      activeRentals: activeRentals.length,
      totalRentals: projectRentals.length,
      monthlySpend,
      costToDate,
      openContracts,
      invoiceCount: projectInvoices.length,
      totalInvoiced,
    };
  }) || [];

  const exportExecutiveSummary = () => {
    const data = [
      {
        Metric: "Total Monthly Spend",
        Value: formatCurrency(totalMonthlySpend),
      },
      {
        Metric: "Active Rentals",
        Value: filteredRentals.filter((r) => r.status === "active").length,
      },
      {
        Metric: "Total Rentals",
        Value: filteredRentals.length,
      },
      {
        Metric: "Total Invoiced",
        Value: formatCurrency(totalInvoiced),
      },
      {
        Metric: "Invoice Count",
        Value: filteredInvoices.length,
      },
    ];
    downloadCSV(data, `executive-summary-${new Date().toISOString().split("T")[0]}.csv`);
  };

  const exportProjectReport = () => {
    const data = projectSummary.map((p) => ({
      Code: p.code,
      Name: p.name,
      Status: p.status,
      "Active Rentals": p.activeRentals,
      "Total Rentals": p.totalRentals,
      "Monthly Rate": p.monthlySpend,
      "Cost to Date": p.costToDate,
      "Open Contracts": p.openContracts,
      "Invoice Count": p.invoiceCount,
      "Total Invoiced": p.totalInvoiced,
    }));
    downloadCSV(data, `project-report-${new Date().toISOString().split("T")[0]}.csv`);
  };

  const exportRentalReport = () => {
    const data = filteredRentals.map((rental) => {
      const project = projects?.find((p) => p.id === rental.projectId);
      return {
        "Project Code": project?.code || "N/A",
        "Equipment Name": rental.equipmentName,
        "Equipment Type": rental.equipmentType,
        Vendor: rental.vendor || "",
        "Start Date": rental.rentalStartDate,
        "Return Date": rental.returnDate || "",
        "Renewal Date": rental.contractRenewalDate || "",
        "Monthly Cost": rental.monthlyCost,
        Status: rental.status,
        Notes: rental.notes || "",
      };
    });
    downloadCSV(data, `rental-report-${new Date().toISOString().split("T")[0]}.csv`);
  };

  const handleDownloadPDF = async (reportType: string) => {
    const params = new URLSearchParams();
    if (dateFrom) params.append("dateFrom", dateFrom);
    if (dateTo) params.append("dateTo", dateTo);
    if (selectedProject !== "all") params.append("projectId", selectedProject);
    
    window.open(`/api/reports/${reportType}/pdf?${params.toString()}`, "_blank");
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">Generate and export reports for your equipment rentals</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Report Filters</CardTitle>
          <CardDescription>Filter reports by date range and project</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[160px]"
                data-testid="input-report-date-from"
              />
              <span className="text-muted-foreground">to</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[160px]"
                data-testid="input-report-date-to"
              />
            </div>
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger className="w-[200px]" data-testid="select-report-project">
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects?.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.code} - {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">
              <BarChart3 className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Monthly Spend</p>
              <p className="text-2xl font-bold">{formatCurrency(totalMonthlySpend)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10">
              <ClipboardList className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active Rentals</p>
              <p className="text-2xl font-bold">
                {filteredRentals.filter((r) => r.status === "active").length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/10">
              <FileText className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Invoices</p>
              <p className="text-2xl font-bold">{filteredInvoices.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-500/10">
              <Building2 className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Invoiced</p>
              <p className="text-2xl font-bold">{formatCurrency(totalInvoiced)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="executive" className="space-y-4">
        <TabsList>
          <TabsTrigger value="executive" data-testid="tab-executive-report">Executive Summary</TabsTrigger>
          <TabsTrigger value="project" data-testid="tab-project-report">By Project</TabsTrigger>
          <TabsTrigger value="rental" data-testid="tab-rental-report">Rental Details</TabsTrigger>
        </TabsList>

        <TabsContent value="executive" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle>Executive Summary</CardTitle>
                <CardDescription>
                  High-level overview of equipment rental costs and status
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={exportExecutiveSummary} data-testid="button-export-executive-csv">
                  <Download className="h-4 w-4 mr-2" />
                  CSV
                </Button>
                <Button onClick={() => handleDownloadPDF("executive")} data-testid="button-export-executive-pdf">
                  <Download className="h-4 w-4 mr-2" />
                  PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Total Monthly Equipment Cost</p>
                    <p className="text-3xl font-bold text-primary">{formatCurrency(totalMonthlySpend)}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Active Rental Contracts</p>
                    <p className="text-3xl font-bold">
                      {filteredRentals.filter((r) => r.status === "active").length}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Total Equipment Rentals</p>
                    <p className="text-3xl font-bold">{filteredRentals.length}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Active Projects</p>
                    <p className="text-3xl font-bold">
                      {projects?.filter((p) => p.status === "active").length || 0}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Total Invoiced Amount</p>
                    <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                      {formatCurrency(totalInvoiced)}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Invoice Count</p>
                    <p className="text-3xl font-bold">{filteredInvoices.length}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="project" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle>Project Report</CardTitle>
                <CardDescription>Equipment rental costs and details by project</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={exportProjectReport} data-testid="button-export-project-csv">
                  <Download className="h-4 w-4 mr-2" />
                  CSV
                </Button>
                <Button onClick={() => handleDownloadPDF("project")} data-testid="button-export-project-pdf">
                  <Download className="h-4 w-4 mr-2" />
                  PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6">
                  <Skeleton className="h-48 w-full" />
                </div>
              ) : projectSummary.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Rentals</TableHead>
                      <TableHead>Monthly Rate</TableHead>
                      <TableHead>Cost to Date</TableHead>
                      <TableHead>Open Contracts</TableHead>
                      <TableHead>Total Invoiced</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectSummary.map((project) => (
                      <TableRow key={project.id}>
                        <TableCell>
                          <div>
                            <span className="font-medium">{project.code}</span>
                            <p className="text-xs text-muted-foreground">{project.name}</p>
                          </div>
                        </TableCell>
                        <TableCell className="capitalize">{project.status.replace("_", " ")}</TableCell>
                        <TableCell>
                          {project.activeRentals} / {project.totalRentals}
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(project.monthlySpend)}
                        </TableCell>
                        <TableCell className="font-bold text-orange-600 dark:text-orange-400">
                          {formatCurrency(project.costToDate)}
                        </TableCell>
                        <TableCell>{project.openContracts}</TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(project.totalInvoiced)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex items-center justify-center p-12 text-muted-foreground">
                  No project data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rental" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle>Rental Details Report</CardTitle>
                <CardDescription>Detailed list of all equipment rentals</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={exportRentalReport} data-testid="button-export-rental-csv">
                  <Download className="h-4 w-4 mr-2" />
                  CSV
                </Button>
                <Button onClick={() => handleDownloadPDF("rental")} data-testid="button-export-rental-pdf">
                  <Download className="h-4 w-4 mr-2" />
                  PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6">
                  <Skeleton className="h-48 w-full" />
                </div>
              ) : filteredRentals.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead>Equipment</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Monthly Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRentals.map((rental) => {
                      const project = projects?.find((p) => p.id === rental.projectId);
                      return (
                        <TableRow key={rental.id}>
                          <TableCell>
                            <span className="font-mono text-sm">{project?.code || "N/A"}</span>
                          </TableCell>
                          <TableCell>
                            <div>
                              <span className="font-medium">{rental.equipmentName}</span>
                              <p className="text-xs text-muted-foreground">{rental.equipmentType}</p>
                            </div>
                          </TableCell>
                          <TableCell>{rental.vendor || "-"}</TableCell>
                          <TableCell>
                            {new Date(rental.rentalStartDate).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="capitalize">{rental.status}</TableCell>
                          <TableCell className="font-medium">
                            {formatCurrency(rental.monthlyCost)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex items-center justify-center p-12 text-muted-foreground">
                  No rental data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
