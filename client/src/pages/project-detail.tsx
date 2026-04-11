import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useParams, Link } from "wouter";
import {
  ArrowLeft,
  Plus,
  FolderKanban,
  MapPin,
  Calendar,
  ClipboardList,
  FileText,
  DollarSign,
  MoreHorizontal,
  Pencil,
  Trash2,
  Download,
  Eye,
  XCircle,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project, Rental, Invoice, Equipment } from "@shared/schema";

const rentalFormSchema = z.object({
  equipmentId: z.string().optional(),
  equipmentName: z.string().min(1, "Equipment name is required"),
  equipmentNumber: z.string().optional(),
  equipmentType: z.string().min(1, "Equipment type is required"),
  vendor: z.string().optional(),
  rentalStartDate: z.string().min(1, "Start date is required"),
  returnDate: z.string().optional(),
  contractRenewalDate: z.string().optional(),
  monthlyCost: z.string().min(1, "Monthly cost is required"),
  isOpenContract: z.boolean().default(false),
  status: z.enum(["active", "returned", "overdue", "pending"]),
  notes: z.string().optional(),
});

type RentalFormData = z.infer<typeof rentalFormSchema>;

const statusColors: Record<string, string> = {
  active: "bg-green-500/10 text-green-600 dark:text-green-400",
  completed: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  on_hold: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  cancelled: "bg-red-500/10 text-red-600 dark:text-red-400",
  returned: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  overdue: "bg-red-500/10 text-red-600 dark:text-red-400",
  pending: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
};

const statusLabels: Record<string, string> = {
  active: "Active",
  completed: "Completed",
  on_hold: "On Hold",
  cancelled: "Cancelled",
  returned: "Returned",
  overdue: "Overdue",
  pending: "Pending",
};

function formatCurrency(amount: string | number | null): string {
  if (!amount) return "$0";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

function calculateCostToDate(rental: Rental): number {
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
}

function getRenewalCycleCount(rental: Rental): number {
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
  let count = 0;
  let checkDate = new Date(startDate);

  while (true) {
    const nextMonth = checkDate.getMonth() + 1;
    const nextYear = checkDate.getFullYear() + (nextMonth > 11 ? 1 : 0);
    const normalizedMonth = nextMonth % 12;
    const daysInNextMonth = new Date(nextYear, normalizedMonth + 1, 0).getDate();
    const actualDay = Math.min(renewalDay, daysInNextMonth);
    const nextRenewal = new Date(nextYear, normalizedMonth, actualDay);

    if (nextRenewal <= endDate) {
      count++;
      checkDate = nextRenewal;
    } else {
      break;
    }
  }

  return count;
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRental, setEditingRental] = useState<Rental | null>(null);
  const { toast } = useToast();

  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["/api/projects", id],
  });

  const { data: rentals, isLoading: rentalsLoading } = useQuery<Rental[]>({
    queryKey: ["/api/projects", id, "rentals"],
  });

  const { data: invoices, isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/projects", id, "invoices"],
  });

  const { data: equipment } = useQuery<Equipment[]>({
    queryKey: ["/api/equipment"],
  });

  const form = useForm<RentalFormData>({
    resolver: zodResolver(rentalFormSchema),
    defaultValues: {
      equipmentId: "",
      equipmentName: "",
      equipmentNumber: "",
      equipmentType: "",
      vendor: "",
      rentalStartDate: "",
      returnDate: "",
      contractRenewalDate: "",
      monthlyCost: "",
      isOpenContract: false,
      status: "active",
      notes: "",
    },
  });

  const isOpenContract = form.watch("isOpenContract");

  const createMutation = useMutation({
    mutationFn: (data: RentalFormData) =>
      apiRequest("POST", "/api/rentals", { ...data, projectId: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "rentals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rentals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      setDialogOpen(false);
      form.reset();
      toast({ title: "Rental created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create rental", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: RentalFormData) =>
      apiRequest("PATCH", `/api/rentals/${editingRental?.id}`, { ...data, projectId: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "rentals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rentals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      setDialogOpen(false);
      setEditingRental(null);
      form.reset();
      toast({ title: "Rental updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update rental", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (rentalId: string) => apiRequest("DELETE", `/api/rentals/${rentalId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "rentals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rentals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Rental deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete rental", variant: "destructive" });
    },
  });

  const closeContractMutation = useMutation({
    mutationFn: (rentalId: string) =>
      apiRequest("POST", `/api/rentals/${rentalId}/close-contract`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "rentals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rentals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Contract closed successfully" });
    },
    onError: () => {
      toast({ title: "Failed to close contract", variant: "destructive" });
    },
  });

  const handleEquipmentSelect = (equipmentId: string) => {
    const selectedEquipment = equipment?.find((e) => e.id === equipmentId);
    if (selectedEquipment) {
      form.setValue("equipmentId", selectedEquipment.id);
      form.setValue("equipmentName", selectedEquipment.name);
      form.setValue("equipmentType", selectedEquipment.type);
      form.setValue("monthlyCost", selectedEquipment.baseMonthlyCost);
      if (selectedEquipment.vendor) {
        form.setValue("vendor", selectedEquipment.vendor);
      }
    }
  };

  const handleEdit = (rental: Rental) => {
    setEditingRental(rental);
    form.reset({
      equipmentId: rental.equipmentId || "",
      equipmentName: rental.equipmentName,
      equipmentNumber: rental.equipmentNumber || "",
      equipmentType: rental.equipmentType,
      vendor: rental.vendor || "",
      rentalStartDate: rental.rentalStartDate,
      returnDate: rental.returnDate || "",
      contractRenewalDate: rental.contractRenewalDate || "",
      monthlyCost: rental.monthlyCost,
      isOpenContract: rental.isOpenContract || false,
      status: rental.status,
      notes: rental.notes || "",
    });
    setDialogOpen(true);
  };

  const handleDelete = (rental: Rental) => {
    if (confirm(`Are you sure you want to delete this rental for "${rental.equipmentName}"?`)) {
      deleteMutation.mutate(rental.id);
    }
  };

  const handleCloseContract = (rental: Rental) => {
    if (confirm(`Close the open contract for "${rental.equipmentName}"? Costs will stop accruing.`)) {
      closeContractMutation.mutate(rental.id);
    }
  };

  const onSubmit = (data: RentalFormData) => {
    let renewalDate: string | null = data.contractRenewalDate || null;
    if (data.isOpenContract && data.rentalStartDate) {
      const start = new Date(data.rentalStartDate + "T00:00:00");
      const renewalDay = start.getDate();
      const nextMonth = start.getMonth() + 1;
      const nextYear = start.getFullYear() + (nextMonth > 11 ? 1 : 0);
      const normalizedMonth = nextMonth % 12;
      const daysInNextMonth = new Date(nextYear, normalizedMonth + 1, 0).getDate();
      const actualDay = Math.min(renewalDay, daysInNextMonth);
      const renewal = new Date(nextYear, normalizedMonth, actualDay);
      renewalDate = renewal.toISOString().split("T")[0];
    }

    const cleaned = {
      ...data,
      returnDate: data.returnDate || null,
      contractRenewalDate: renewalDate,
      vendor: data.vendor || null,
      notes: data.notes || null,
      equipmentId: data.equipmentId || null,
    };
    if (editingRental) {
      updateMutation.mutate(cleaned as any);
    } else {
      createMutation.mutate(cleaned as any);
    }
  };

  const totalCostToDate = rentals?.reduce((sum, r) => sum + calculateCostToDate(r), 0) || 0;

  const totalMonthlySpend = rentals
    ?.filter((r) => r.status === "active")
    .reduce((sum, r) => sum + parseFloat(r.monthlyCost), 0) || 0;

  const totalInvoiceAmount = invoices?.reduce(
    (sum, inv) => sum + (inv.amount ? parseFloat(inv.amount) : 0),
    0
  ) || 0;

  if (projectLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-6 w-24 mb-2" />
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Project not found</h3>
            <Link href="/projects">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Projects
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/projects">
          <Button variant="ghost" size="icon" data-testid="button-back-to-projects">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
            <Badge className={statusColors[project.status]}>
              {statusLabels[project.status]}
            </Badge>
          </div>
          <p className="text-muted-foreground font-mono">{project.code}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 shrink-0">
              <ClipboardList className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active Rentals</p>
              <p className="text-lg font-bold" data-testid="text-active-rentals-count">
                {rentals?.filter((r) => r.status === "active").length || 0}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500/10 shrink-0">
              <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Monthly Rate</p>
              <p className="text-lg font-bold" data-testid="text-monthly-spend">{formatCurrency(totalMonthlySpend)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500/10 shrink-0">
              <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Invoices</p>
              <p className="text-lg font-bold">{invoices?.length || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-500/10 shrink-0">
              <DollarSign className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Invoiced</p>
              <p className="text-lg font-bold">{formatCurrency(totalInvoiceAmount)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {(() => {
        const budgetAmount = project.budget ? parseFloat(project.budget) : 0;
        const budgetPercent = budgetAmount > 0 ? Math.min((totalCostToDate / budgetAmount) * 100, 100) : 0;
        const overBudget = budgetAmount > 0 && totalCostToDate > budgetAmount;
        const remaining = budgetAmount > 0 ? budgetAmount - totalCostToDate : 0;

        return (
          <Card className={overBudget ? "border-destructive/50" : ""}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-full shrink-0 ${overBudget ? "bg-destructive/10" : "bg-orange-500/10"}`}>
                    <TrendingUp className={`h-4 w-4 ${overBudget ? "text-destructive" : "text-orange-600 dark:text-orange-400"}`} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Cost to Date vs Budget</p>
                    <p className="text-lg font-bold" data-testid="text-cost-to-date">
                      {formatCurrency(totalCostToDate)}
                      {budgetAmount > 0 && (
                        <span className="text-sm font-normal text-muted-foreground"> / {formatCurrency(budgetAmount)}</span>
                      )}
                    </p>
                  </div>
                </div>
                {budgetAmount > 0 && (
                  <div className="text-right">
                    {overBudget ? (
                      <Badge variant="destructive" data-testid="badge-over-budget">
                        Over by {formatCurrency(Math.abs(remaining))}
                      </Badge>
                    ) : (
                      <Badge variant="outline" data-testid="badge-remaining-budget">
                        {formatCurrency(remaining)} remaining
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              {budgetAmount > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{budgetPercent.toFixed(0)}% of budget used</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${overBudget ? "bg-destructive" : budgetPercent > 80 ? "bg-orange-500" : "bg-green-500"}`}
                      style={{ width: `${Math.min(budgetPercent, 100)}%` }}
                      data-testid="progress-budget"
                    />
                  </div>
                </div>
              )}
              {budgetAmount === 0 && (
                <p className="text-xs text-muted-foreground">No budget set for this project. Edit the project to add an equipment rental budget.</p>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {(project.address || project.startDate || project.endDate || project.notes) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Project Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {project.address && (
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Location</p>
                  <p className="text-sm text-muted-foreground">{project.address}</p>
                </div>
              </div>
            )}
            {(project.startDate || project.endDate) && (
              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Duration</p>
                  <p className="text-sm text-muted-foreground">
                    {project.startDate
                      ? new Date(project.startDate).toLocaleDateString()
                      : "N/A"}{" "}
                    -{" "}
                    {project.endDate
                      ? new Date(project.endDate).toLocaleDateString()
                      : "Ongoing"}
                  </p>
                </div>
              </div>
            )}
            {project.notes && (
              <div className="md:col-span-2">
                <p className="text-sm font-medium mb-1">Notes</p>
                <p className="text-sm text-muted-foreground">{project.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="rentals" className="space-y-4">
        <TabsList>
          <TabsTrigger value="rentals" data-testid="tab-rentals">
            Rentals ({rentals?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="invoices" data-testid="tab-invoices">
            Invoices ({invoices?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rentals" className="space-y-4">
          <div className="flex justify-end">
            <Dialog
              open={dialogOpen}
              onOpenChange={(open) => {
                setDialogOpen(open);
                if (!open) {
                  setEditingRental(null);
                  form.reset();
                }
              }}
            >
              <DialogTrigger asChild>
                <Button data-testid="button-add-rental-to-project">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Rental
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingRental ? "Edit Rental" : "Add Rental"}</DialogTitle>
                  <DialogDescription>
                    {editingRental
                      ? "Update the rental details below."
                      : "Add new equipment rental to this project."}
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div>
                      <FormLabel>Select from Catalog (Optional)</FormLabel>
                      <Select onValueChange={handleEquipmentSelect}>
                        <SelectTrigger className="mt-2" data-testid="select-equipment-from-catalog">
                          <SelectValue placeholder="Choose equipment to auto-fill" />
                        </SelectTrigger>
                        <SelectContent>
                          {equipment?.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.name} - {formatCurrency(item.baseMonthlyCost)}/mo
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="equipmentName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Equipment Name</FormLabel>
                            <FormControl>
                              <Input placeholder="CAT 320 Excavator" {...field} data-testid="input-rental-equipment-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="equipmentType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Equipment Type</FormLabel>
                            <FormControl>
                              <Input placeholder="Excavator" {...field} data-testid="input-rental-equipment-type" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="equipmentNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Equipment Number (Optional)</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. EQ-1234" {...field} data-testid="input-rental-equipment-number" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="vendor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Vendor (Optional)</FormLabel>
                            <FormControl>
                              <Input placeholder="United Rentals" {...field} data-testid="input-rental-vendor" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="monthlyCost"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Monthly Cost ($)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" placeholder="2500.00" {...field} data-testid="input-rental-monthly-cost" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="isOpenContract"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center gap-3 rounded-md border p-3">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-open-contract"
                            />
                          </FormControl>
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm font-medium cursor-pointer">Open Contract</FormLabel>
                            <p className="text-xs text-muted-foreground">
                              Open-ended rental. Costs accrue monthly on the renewal date until the contract is closed.
                            </p>
                          </div>
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="rentalStartDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Start Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} data-testid="input-rental-start-date" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {!isOpenContract && (
                        <FormField
                          control={form.control}
                          name="returnDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Return Date</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} data-testid="input-rental-return-date" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>

                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="returned">Returned</SelectItem>
                              <SelectItem value="overdue">Overdue</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notes (Optional)</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Additional rental details..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <DialogFooter>
                      <Button
                        type="submit"
                        disabled={createMutation.isPending || updateMutation.isPending}
                        data-testid="button-submit-project-rental"
                      >
                        {createMutation.isPending || updateMutation.isPending
                          ? "Saving..."
                          : editingRental
                          ? "Update Rental"
                          : "Add Rental"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          {rentalsLoading ? (
            <Card>
              <CardContent className="p-6">
                <Skeleton className="h-48 w-full" />
              </CardContent>
            </Card>
          ) : rentals && rentals.length > 0 ? (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Equipment</TableHead>
                      <TableHead>Contract</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Monthly Rate</TableHead>
                      <TableHead>Renewals</TableHead>
                      <TableHead>Cost to Date</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rentals.map((rental) => {
                      const costToDate = calculateCostToDate(rental);
                      const renewals = getRenewalCycleCount(rental);

                      return (
                        <TableRow key={rental.id} className="hover-elevate" data-testid={`row-rental-${rental.id}`}>
                          <TableCell>
                            <div>
                              <span className="font-medium">{rental.equipmentName}</span>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                {rental.equipmentNumber && (
                                  <>
                                    <span>#{rental.equipmentNumber}</span>
                                    <span>-</span>
                                  </>
                                )}
                                <span>{rental.equipmentType}</span>
                                {rental.vendor && (
                                  <>
                                    <span>-</span>
                                    <span>{rental.vendor}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {rental.isOpenContract ? (
                              rental.contractClosedDate ? (
                                <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400" data-testid={`badge-contract-closed-${rental.id}`}>
                                  Closed
                                </Badge>
                              ) : (
                                <Badge className="bg-orange-500/10 text-orange-600 dark:text-orange-400" data-testid={`badge-contract-open-${rental.id}`}>
                                  Open
                                </Badge>
                              )
                            ) : (
                              <span className="text-sm text-muted-foreground">Fixed</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={statusColors[rental.status]}>
                              {statusLabels[rental.status]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{new Date(rental.rentalStartDate).toLocaleDateString()}</div>
                              <div className="text-muted-foreground text-xs">
                                {rental.isOpenContract && rental.contractClosedDate
                                  ? `Closed ${new Date(rental.contractClosedDate).toLocaleDateString()}`
                                  : rental.returnDate
                                  ? `to ${new Date(rental.returnDate).toLocaleDateString()}`
                                  : rental.isOpenContract
                                  ? "Open-ended"
                                  : "Ongoing"}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">{formatCurrency(rental.monthlyCost)}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm" data-testid={`text-renewals-${rental.id}`}>{renewals}</span>
                          </TableCell>
                          <TableCell>
                            <span className="font-bold text-orange-600 dark:text-orange-400" data-testid={`text-cost-to-date-${rental.id}`}>
                              {formatCurrency(costToDate)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" data-testid={`button-rental-actions-${rental.id}`}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleEdit(rental)} className="gap-2">
                                  <Pencil className="h-4 w-4" />
                                  Edit
                                </DropdownMenuItem>
                                {rental.isOpenContract && !rental.contractClosedDate && (
                                  <DropdownMenuItem
                                    onClick={() => handleCloseContract(rental)}
                                    className="gap-2"
                                    data-testid={`button-close-contract-${rental.id}`}
                                  >
                                    <XCircle className="h-4 w-4" />
                                    Close Contract
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={() => handleDelete(rental)}
                                  className="gap-2 text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No rentals yet</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Add equipment rentals to track costs for this project.
                </p>
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Rental
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="invoices" className="space-y-4">
          {invoicesLoading ? (
            <Card>
              <CardContent className="p-6">
                <Skeleton className="h-48 w-full" />
              </CardContent>
            </Card>
          ) : invoices && invoices.length > 0 ? (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Coverage Period</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((invoice) => {
                      const rental = rentals?.find((r) => r.id === invoice.rentalId);
                      return (
                        <TableRow key={invoice.id} className="hover-elevate">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                                <FileText className="h-4 w-4 text-primary" />
                              </div>
                              <div>
                                <span className="font-medium">
                                  {invoice.invoiceNumber || "No Number"}
                                </span>
                                <p className="text-xs text-muted-foreground">
                                  {rental?.equipmentName || "N/A"}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {new Date(invoice.invoiceDate).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            {invoice.coveragePeriodStart && invoice.coveragePeriodEnd ? (
                              <span className="text-sm">
                                {new Date(invoice.coveragePeriodStart).toLocaleDateString()} -{" "}
                                {new Date(invoice.coveragePeriodEnd).toLocaleDateString()}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">
                              {invoice.amount ? formatCurrency(invoice.amount) : "-"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                  <a
                                    href={`/api/invoices/${invoice.id}/download`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2"
                                  >
                                    <Eye className="h-4 w-4" />
                                    View
                                  </a>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <a
                                    href={`/api/invoices/${invoice.id}/download?attachment=true`}
                                    className="flex items-center gap-2"
                                  >
                                    <Download className="h-4 w-4" />
                                    Download
                                  </a>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No invoices yet</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Upload invoices for rentals on this project.
                </p>
                <Link href="/invoices">
                  <Button>Go to Invoices</Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
