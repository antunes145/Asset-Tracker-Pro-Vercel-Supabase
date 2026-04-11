import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import {
  Plus,
  Search,
  FileText,
  MoreHorizontal,
  Trash2,
  Upload,
  Download,
  Eye,
  DollarSign,
  Calendar,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Invoice, Rental, Project } from "@shared/schema";

const invoiceFormSchema = z.object({
  rentalId: z.string().min(1, "Rental is required"),
  invoiceDate: z.string().min(1, "Invoice date is required"),
  invoiceNumber: z.string().optional(),
  amount: z.string().optional(),
  coveragePeriodStart: z.string().optional(),
  coveragePeriodEnd: z.string().optional(),
});

type InvoiceFormData = z.infer<typeof invoiceFormSchema>;

interface InvoiceWithDetails extends Invoice {
  rental?: Rental;
  project?: Project;
}

function formatCurrency(amount: string | number | null): string {
  if (!amount) return "-";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(num);
}

export default function Invoices() {
  const [searchQuery, setSearchQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const { data: invoices, isLoading } = useQuery<InvoiceWithDetails[]>({
    queryKey: ["/api/invoices"],
  });

  const { data: rentals } = useQuery<Rental[]>({
    queryKey: ["/api/rentals"],
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const form = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      rentalId: "",
      invoiceDate: "",
      invoiceNumber: "",
      amount: "",
      coveragePeriodStart: "",
      coveragePeriodEnd: "",
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/invoices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Invoice deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete invoice", variant: "destructive" });
    },
  });

  const handleDelete = (invoice: Invoice) => {
    if (confirm("Are you sure you want to delete this invoice?")) {
      deleteMutation.mutate(invoice.id);
    }
  };

  const onSubmit = async (data: InvoiceFormData) => {
    if (!selectedFile) {
      toast({ title: "Please select a file to upload", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("rentalId", data.rentalId);
      formData.append("invoiceDate", data.invoiceDate);
      if (data.invoiceNumber) formData.append("invoiceNumber", data.invoiceNumber);
      if (data.amount) formData.append("amount", data.amount);
      if (data.coveragePeriodStart) formData.append("coveragePeriodStart", data.coveragePeriodStart);
      if (data.coveragePeriodEnd) formData.append("coveragePeriodEnd", data.coveragePeriodEnd);

      const rental = rentals?.find((r) => r.id === data.rentalId);
      if (rental) {
        formData.append("projectId", rental.projectId);
      }

      const response = await fetch("/api/invoices/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      setDialogOpen(false);
      setSelectedFile(null);
      form.reset();
      toast({ title: "Invoice uploaded successfully" });
    } catch (error) {
      toast({ title: "Failed to upload invoice", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const filteredInvoices = invoices?.filter((invoice) => {
    const matchesSearch =
      invoice.invoiceNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      invoice.fileName?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesProject = projectFilter === "all" || invoice.projectId === projectFilter;
    return matchesSearch && matchesProject;
  });

  const totalAmount = filteredInvoices?.reduce((sum, inv) => {
    return sum + (inv.amount ? parseFloat(inv.amount) : 0);
  }, 0) || 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
          <p className="text-muted-foreground">Manage and view all rental invoices</p>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setSelectedFile(null);
              form.reset();
            }
          }}
        >
          <DialogTrigger asChild>
            <Button data-testid="button-upload-invoice">
              <Upload className="h-4 w-4 mr-2" />
              Upload Invoice
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Upload Invoice</DialogTitle>
              <DialogDescription>
                Upload a PDF, JPG, or PNG invoice file for a rental.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="rentalId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rental</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-invoice-rental">
                            <SelectValue placeholder="Select rental" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {rentals?.map((rental) => {
                            const project = projects?.find((p) => p.id === rental.projectId);
                            return (
                              <SelectItem key={rental.id} value={rental.id}>
                                {rental.equipmentName} - {project?.code || "N/A"}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div>
                  <FormLabel>Invoice File</FormLabel>
                  <div className="mt-2">
                    <Input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      data-testid="input-invoice-file"
                    />
                  </div>
                  {selectedFile && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Selected: {selectedFile.name}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="invoiceDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Invoice Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-invoice-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="invoiceNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Invoice Number</FormLabel>
                        <FormControl>
                          <Input placeholder="INV-001" {...field} data-testid="input-invoice-number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount (Optional)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="2500.00" {...field} data-testid="input-invoice-amount" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="coveragePeriodStart"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Coverage Start</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-invoice-coverage-start" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="coveragePeriodEnd"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Coverage End</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-invoice-coverage-end" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <DialogFooter>
                  <Button type="submit" disabled={uploading || !selectedFile} data-testid="button-submit-invoice">
                    {uploading ? "Uploading..." : "Upload Invoice"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Invoices</p>
              <p className="text-2xl font-bold">{invoices?.length || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
              <DollarSign className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Amount</p>
              <p className="text-2xl font-bold">{formatCurrency(totalAmount)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search invoices..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-invoices"
          />
        </div>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-filter-invoice-project">
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
                  <TableHead>Invoice</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Equipment</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3, 4].map((i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : filteredInvoices && filteredInvoices.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Equipment</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Coverage</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((invoice) => {
                  const rental = rentals?.find((r) => r.id === invoice.rentalId);
                  const project = projects?.find((p) => p.id === invoice.projectId);

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
                            <p className="text-xs text-muted-foreground truncate max-w-[150px]">
                              {invoice.fileName}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Link href={`/projects/${invoice.projectId}`} className="text-primary hover:underline">
                          {project?.code || "N/A"}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{rental?.equipmentName || "N/A"}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          {new Date(invoice.invoiceDate).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        {invoice.coveragePeriodStart && invoice.coveragePeriodEnd ? (
                          <span className="text-xs">
                            {new Date(invoice.coveragePeriodStart).toLocaleDateString()} - {new Date(invoice.coveragePeriodEnd).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">
                          {formatCurrency(invoice.amount)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-invoice-menu-${invoice.id}`}>
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
                            <DropdownMenuItem
                              onClick={() => handleDelete(invoice)}
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
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No invoices found</h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery || projectFilter !== "all"
                ? "Try adjusting your search or filter criteria."
                : "Upload your first invoice to get started."}
            </p>
            {!searchQuery && projectFilter === "all" && (
              <Button onClick={() => setDialogOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Upload Invoice
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
