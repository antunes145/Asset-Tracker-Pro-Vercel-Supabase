import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Search,
  Truck,
  MoreHorizontal,
  Pencil,
  Trash2,
  DollarSign,
  Building2,
  Calculator,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
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
import type { Equipment, EquipmentType } from "@shared/schema";

const equipmentFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.string().min(1, "Type is required"),
  baseMonthlyCost: z.string().min(1, "Base monthly cost is required"),
  weeklyCost: z.string().optional(),
  fourWeekCost: z.string().optional(),
  pickupCost: z.string().optional(),
  dropoffCost: z.string().optional(),
  taxPercent: z.string().optional(),
  miscCost: z.string().optional(),
  miscDescription: z.string().optional(),
  vendor: z.string().optional(),
  notes: z.string().optional(),
});

type EquipmentFormData = z.infer<typeof equipmentFormSchema>;

function formatCurrency(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "$0";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
}

function CostSummary({ form }: { form: any }) {
  const weeklyCost = parseFloat(form.watch("weeklyCost") || "0");
  const fourWeekCost = parseFloat(form.watch("fourWeekCost") || "0");
  const pickupCost = parseFloat(form.watch("pickupCost") || "0");
  const dropoffCost = parseFloat(form.watch("dropoffCost") || "0");
  const taxPercent = parseFloat(form.watch("taxPercent") || "0");
  const miscCost = parseFloat(form.watch("miscCost") || "0");

  const subtotal = fourWeekCost + pickupCost + dropoffCost + miscCost;
  const taxAmount = subtotal * (taxPercent / 100);
  const total = subtotal + taxAmount;

  if (fourWeekCost <= 0 && weeklyCost <= 0) return null;

  return (
    <div className="rounded-md border p-3 space-y-2 bg-muted/30">
      <div className="flex items-center gap-2 mb-2">
        <Calculator className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Cost Breakdown (4-week estimate)</span>
      </div>
      <div className="grid grid-cols-2 gap-1 text-sm">
        {weeklyCost > 0 && (
          <>
            <span className="text-muted-foreground">Weekly Rate:</span>
            <span className="text-right">{formatCurrency(weeklyCost)}</span>
          </>
        )}
        {fourWeekCost > 0 && (
          <>
            <span className="text-muted-foreground">4-Week Rate:</span>
            <span className="text-right">{formatCurrency(fourWeekCost)}</span>
          </>
        )}
        {pickupCost > 0 && (
          <>
            <span className="text-muted-foreground">Pickup:</span>
            <span className="text-right">{formatCurrency(pickupCost)}</span>
          </>
        )}
        {dropoffCost > 0 && (
          <>
            <span className="text-muted-foreground">Drop-off:</span>
            <span className="text-right">{formatCurrency(dropoffCost)}</span>
          </>
        )}
        {miscCost > 0 && (
          <>
            <span className="text-muted-foreground">Misc:</span>
            <span className="text-right">{formatCurrency(miscCost)}</span>
          </>
        )}
      </div>
      <Separator />
      <div className="grid grid-cols-2 gap-1 text-sm">
        <span className="text-muted-foreground">Subtotal:</span>
        <span className="text-right">{formatCurrency(subtotal)}</span>
        {taxPercent > 0 && (
          <>
            <span className="text-muted-foreground">Tax ({taxPercent}%):</span>
            <span className="text-right">{formatCurrency(taxAmount)}</span>
          </>
        )}
        <span className="font-semibold">Total:</span>
        <span className="text-right font-semibold">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}

export default function EquipmentPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [typeSearchOpen, setTypeSearchOpen] = useState(false);
  const { toast } = useToast();

  const { data: equipment, isLoading } = useQuery<Equipment[]>({
    queryKey: ["/api/equipment"],
  });

  const { data: equipmentTypes } = useQuery<EquipmentType[]>({
    queryKey: ["/api/equipment-types"],
  });

  const form = useForm<EquipmentFormData>({
    resolver: zodResolver(equipmentFormSchema),
    defaultValues: {
      name: "",
      type: "",
      baseMonthlyCost: "",
      weeklyCost: "",
      fourWeekCost: "",
      pickupCost: "0",
      dropoffCost: "0",
      taxPercent: "0",
      miscCost: "0",
      miscDescription: "",
      vendor: "",
      notes: "",
    },
  });

  const handleSelectEquipmentType = (eqType: EquipmentType) => {
    form.setValue("type", eqType.name);
    form.setValue("weeklyCost", eqType.weeklyCost);
    form.setValue("fourWeekCost", eqType.fourWeekCost);
    form.setValue("baseMonthlyCost", eqType.fourWeekCost);
    form.setValue("pickupCost", eqType.pickupCost || "0");
    form.setValue("dropoffCost", eqType.dropoffCost || "0");
    form.setValue("taxPercent", eqType.taxPercent || "0");
    setTypeSearchOpen(false);
  };

  const createMutation = useMutation({
    mutationFn: (data: EquipmentFormData) => apiRequest("POST", "/api/equipment", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      setDialogOpen(false);
      form.reset();
      toast({ title: "Equipment added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add equipment", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: EquipmentFormData) =>
      apiRequest("PATCH", `/api/equipment/${editingEquipment?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      setDialogOpen(false);
      setEditingEquipment(null);
      form.reset();
      toast({ title: "Equipment updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update equipment", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/equipment/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({ title: "Equipment deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Failed to delete equipment", variant: "destructive" });
    },
  });

  const handleEdit = (item: Equipment) => {
    setEditingEquipment(item);
    form.reset({
      name: item.name,
      type: item.type,
      baseMonthlyCost: item.baseMonthlyCost,
      weeklyCost: item.weeklyCost || "",
      fourWeekCost: item.fourWeekCost || "",
      pickupCost: item.pickupCost || "0",
      dropoffCost: item.dropoffCost || "0",
      taxPercent: item.taxPercent || "0",
      miscCost: item.miscCost || "0",
      miscDescription: item.miscDescription || "",
      vendor: item.vendor || "",
      notes: item.notes || "",
    });
    setDialogOpen(true);
  };

  const handleDelete = (item: Equipment) => {
    if (confirm(`Are you sure you want to delete "${item.name}"?`)) {
      deleteMutation.mutate(item.id);
    }
  };

  const onSubmit = (data: EquipmentFormData) => {
    if (editingEquipment) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const uniqueTypes = equipment
    ? Array.from(new Set(equipment.map((e) => e.type))).sort()
    : [];

  const filteredEquipment = equipment?.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.vendor?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || item.type === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Equipment Catalog</h1>
          <p className="text-muted-foreground">Manage your equipment inventory and rental costs</p>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setEditingEquipment(null);
              form.reset();
            }
          }}
        >
          <DialogTrigger asChild>
            <Button data-testid="button-add-equipment">
              <Plus className="h-4 w-4 mr-2" />
              Add Equipment
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingEquipment ? "Edit Equipment" : "Add Equipment"}</DialogTitle>
              <DialogDescription>
                {editingEquipment
                  ? "Update the equipment details below."
                  : "Add new equipment to your catalog. Select a type from the database to auto-fill costs."}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {equipmentTypes && equipmentTypes.length > 0 && (
                  <div className="space-y-2">
                    <FormLabel>Auto-fill from Equipment Database</FormLabel>
                    <Popover open={typeSearchOpen} onOpenChange={setTypeSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="w-full justify-start text-muted-foreground font-normal"
                          data-testid="button-select-type-from-db"
                        >
                          <Search className="mr-2 h-4 w-4" />
                          Search equipment types...
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Type to search equipment types..." data-testid="input-search-type-db" />
                          <CommandList>
                            <CommandEmpty>No equipment type found.</CommandEmpty>
                            <CommandGroup>
                              {equipmentTypes.map((eqType) => (
                                <CommandItem
                                  key={eqType.id}
                                  value={eqType.name}
                                  onSelect={() => handleSelectEquipmentType(eqType)}
                                  data-testid={`option-type-${eqType.id}`}
                                >
                                  <div className="flex items-center justify-between w-full">
                                    <div className="flex items-center gap-2">
                                      <Truck className="h-4 w-4 text-muted-foreground" />
                                      <span>{eqType.name}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                      <span>{formatCurrency(eqType.weeklyCost)}/wk</span>
                                      <span>{formatCurrency(eqType.fourWeekCost)}/4wk</span>
                                    </div>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Equipment Name</FormLabel>
                      <FormControl>
                        <Input placeholder="CAT 320 Excavator" {...field} data-testid="input-equipment-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type / Category</FormLabel>
                      <FormControl>
                        <Input placeholder="Excavator, Crane, etc." {...field} data-testid="input-equipment-type" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="weeklyCost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Weekly Cost ($)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="625.00"
                            {...field}
                            data-testid="input-equipment-weekly-cost"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="fourWeekCost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>4-Week Cost ($)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="2500.00"
                            {...field}
                            data-testid="input-equipment-four-week-cost"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="baseMonthlyCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Base Monthly Cost ($)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="2500.00"
                          {...field}
                          data-testid="input-equipment-cost"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="pickupCost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pickup Cost ($)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="150.00"
                            {...field}
                            data-testid="input-equipment-pickup-cost"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dropoffCost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Drop-off Cost ($)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="150.00"
                            {...field}
                            data-testid="input-equipment-dropoff-cost"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="taxPercent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tax Rate (%)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="8.25"
                          {...field}
                          data-testid="input-equipment-tax-percent"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="miscCost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Misc Cost ($)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            {...field}
                            data-testid="input-equipment-misc-cost"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="miscDescription"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Misc Description</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Fuel surcharge, etc."
                            {...field}
                            data-testid="input-equipment-misc-desc"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <CostSummary form={form} />

                <FormField
                  control={form.control}
                  name="vendor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vendor (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="United Rentals" {...field} data-testid="input-equipment-vendor" />
                      </FormControl>
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
                        <Textarea
                          placeholder="Additional equipment details..."
                          {...field}
                          data-testid="input-equipment-notes"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-submit-equipment"
                  >
                    {createMutation.isPending || updateMutation.isPending
                      ? "Saving..."
                      : editingEquipment
                      ? "Update Equipment"
                      : "Add Equipment"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search equipment..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-equipment"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-filter-type">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {uniqueTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
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
                  <TableHead>Type</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Weekly</TableHead>
                  <TableHead>4-Week</TableHead>
                  <TableHead>Pickup/Drop</TableHead>
                  <TableHead>Tax</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3, 4].map((i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : filteredEquipment && filteredEquipment.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Equipment</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Weekly</TableHead>
                  <TableHead>4-Week</TableHead>
                  <TableHead>Pickup/Drop</TableHead>
                  <TableHead>Tax</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEquipment.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                          <Truck className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <span className="font-medium">{item.name}</span>
                          {item.miscDescription && (
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                              Misc: {item.miscDescription} ({formatCurrency(item.miscCost)})
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{item.type}</Badge>
                    </TableCell>
                    <TableCell>
                      {item.vendor ? (
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{item.vendor}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{formatCurrency(item.weeklyCost)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{formatCurrency(item.fourWeekCost)}</span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <span>{formatCurrency(item.pickupCost)}</span>
                        <span className="text-muted-foreground"> / </span>
                        <span>{formatCurrency(item.dropoffCost)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{item.taxPercent || "0"}%</Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-equipment-menu-${item.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(item)} className="gap-2">
                            <Pencil className="h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(item)}
                            className="gap-2 text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Truck className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No equipment found</h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery || typeFilter !== "all"
                ? "Try adjusting your search or filter criteria."
                : "Add equipment to your catalog to get started."}
            </p>
            {!searchQuery && typeFilter === "all" && (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Equipment
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
