import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import {
  Plus,
  Search,
  ClipboardList,
  MoreHorizontal,
  Pencil,
  Trash2,
  Calendar,
  AlertTriangle,
  DollarSign,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Rental, Project, Equipment } from "@shared/schema";

const rentalFormSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  equipmentId: z.string().optional(),
  equipmentName: z.string().min(1, "Equipment name is required"),
  equipmentNumber: z.string().optional(),
  equipmentType: z.string().min(1, "Equipment type is required"),
  vendor: z.string().optional(),
  rentalStartDate: z.string().min(1, "Start date is required"),
  returnDate: z.string().optional(),
  contractRenewalDate: z.string().optional(),
  monthlyCost: z.string().min(1, "Monthly cost is required"),
  status: z.enum(["active", "returned", "overdue", "pending"]),
  notes: z.string().optional(),
});

type RentalFormData = z.infer<typeof rentalFormSchema>;

const statusColors: Record<string, string> = {
  active: "bg-green-500/10 text-green-600 dark:text-green-400",
  returned: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  overdue: "bg-red-500/10 text-red-600 dark:text-red-400",
  pending: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
};

const statusLabels: Record<string, string> = {
  active: "Active",
  returned: "Returned",
  overdue: "Overdue",
  pending: "Pending",
};

function formatCurrency(amount: string | number): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

function getDaysUntil(dateString: string | null): number | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffTime = date.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

interface RentalWithProject extends Rental {
  project?: Project;
}

export default function Rentals() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRental, setEditingRental] = useState<Rental | null>(null);
  const { toast } = useToast();

  const { data: rentals, isLoading } = useQuery<RentalWithProject[]>({
    queryKey: ["/api/rentals"],
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: equipment } = useQuery<Equipment[]>({
    queryKey: ["/api/equipment"],
  });

  const form = useForm<RentalFormData>({
    resolver: zodResolver(rentalFormSchema),
    defaultValues: {
      projectId: "",
      equipmentId: "",
      equipmentName: "",
      equipmentNumber: "",
      equipmentType: "",
      vendor: "",
      rentalStartDate: "",
      returnDate: "",
      contractRenewalDate: "",
      monthlyCost: "",
      status: "active",
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: RentalFormData) => apiRequest("POST", "/api/rentals", data),
    onSuccess: () => {
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
      apiRequest("PATCH", `/api/rentals/${editingRental?.id}`, data),
    onSuccess: () => {
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
    mutationFn: (id: string) => apiRequest("DELETE", `/api/rentals/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rentals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Rental deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete rental", variant: "destructive" });
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
      projectId: rental.projectId,
      equipmentId: rental.equipmentId || "",
      equipmentName: rental.equipmentName,
      equipmentNumber: rental.equipmentNumber || "",
      equipmentType: rental.equipmentType,
      vendor: rental.vendor || "",
      rentalStartDate: rental.rentalStartDate,
      returnDate: rental.returnDate || "",
      contractRenewalDate: rental.contractRenewalDate || "",
      monthlyCost: rental.monthlyCost,
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

  const onSubmit = (data: RentalFormData) => {
    if (editingRental) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const filteredRentals = rentals?.filter((rental) => {
    const matchesSearch =
      rental.equipmentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rental.equipmentType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rental.vendor?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || rental.status === statusFilter;
    const matchesProject = projectFilter === "all" || rental.projectId === projectFilter;
    return matchesSearch && matchesStatus && matchesProject;
  });

  const activeCount = rentals?.filter((r) => r.status === "active").length || 0;
  const overdueCount = rentals?.filter((r) => r.status === "overdue").length || 0;
  const renewalAlerts = rentals?.filter((r) => {
    const days = getDaysUntil(r.contractRenewalDate);
    return days !== null && days <= 30 && days >= 0;
  }).length || 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Rentals</h1>
          <p className="text-muted-foreground">Track and manage all equipment rentals</p>
        </div>
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
            <Button data-testid="button-create-rental">
              <Plus className="h-4 w-4 mr-2" />
              New Rental
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingRental ? "Edit Rental" : "Create Rental"}</DialogTitle>
              <DialogDescription>
                {editingRental
                  ? "Update the rental details below."
                  : "Add a new equipment rental to a project."}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="projectId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-rental-project">
                            <SelectValue placeholder="Select project" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {projects?.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              {project.name} ({project.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div>
                  <FormLabel>Select from Catalog (Optional)</FormLabel>
                  <Select onValueChange={handleEquipmentSelect}>
                    <SelectTrigger className="mt-2" data-testid="select-equipment-catalog">
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
                        <Input type="number" step="0.01" placeholder="2500.00" {...field} data-testid="input-rental-cost" />
                      </FormControl>
                      <FormMessage />
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
                </div>

                <FormField
                  control={form.control}
                  name="contractRenewalDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contract Renewal Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-rental-renewal-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-rental-status">
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
                        <Textarea placeholder="Additional rental details..." {...field} data-testid="input-rental-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-submit-rental"
                  >
                    {createMutation.isPending || updateMutation.isPending
                      ? "Saving..."
                      : editingRental
                      ? "Update Rental"
                      : "Create Rental"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Rentals</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue Returns</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{overdueCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Renewals Due (30d)</CardTitle>
            <Calendar className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{renewalAlerts}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search rentals..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-rentals"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-filter-rental-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="returned">Returned</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-filter-rental-project">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects?.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Equipment</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Monthly Cost</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3, 4].map((i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : filteredRentals && filteredRentals.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Equipment</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Monthly Cost</TableHead>
                  <TableHead>Alerts</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRentals.map((rental) => {
                  const renewalDays = getDaysUntil(rental.contractRenewalDate);
                  const project = projects?.find((p) => p.id === rental.projectId);

                  return (
                    <TableRow key={rental.id} className="hover-elevate">
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
                        <Link href={`/projects/${rental.projectId}`} className="text-primary hover:underline">
                          {project?.code || "N/A"}
                        </Link>
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
                            {rental.returnDate
                              ? `to ${new Date(rental.returnDate).toLocaleDateString()}`
                              : "Ongoing"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 font-medium">
                          <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                          {formatCurrency(rental.monthlyCost)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {renewalDays !== null && renewalDays <= 30 && renewalDays >= 0 ? (
                          <Badge
                            variant={renewalDays <= 7 ? "destructive" : "secondary"}
                            className="whitespace-nowrap"
                          >
                            Renewal in {renewalDays}d
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-rental-menu-${rental.id}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(rental)} className="gap-2">
                              <Pencil className="h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
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
            <h3 className="text-lg font-semibold mb-2">No rentals found</h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery || statusFilter !== "all" || projectFilter !== "all"
                ? "Try adjusting your search or filter criteria."
                : "Get started by creating your first rental."}
            </p>
            {!searchQuery && statusFilter === "all" && projectFilter === "all" && (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Rental
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
