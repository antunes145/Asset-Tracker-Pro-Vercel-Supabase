import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import {
  Plus,
  Search,
  FolderKanban,
  MapPin,
  Calendar,
  MoreHorizontal,
  Pencil,
  Trash2,
  ExternalLink,
  LayoutGrid,
  List,
  DollarSign,
  Wrench,
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
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project } from "@shared/schema";

const projectFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().min(1, "Code is required").max(20, "Code must be 20 characters or less"),
  status: z.enum(["active", "completed", "on_hold", "cancelled"]),
  address: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  budget: z.string().optional(),
  notes: z.string().optional(),
});

type ProjectFormData = z.infer<typeof projectFormSchema>;

interface ProjectSpend {
  projectId: string;
  projectName: string;
  projectCode: string;
  totalSpend: number;
  costToDate: number;
  budget: number | null;
  activeRentals: number;
  totalRentals: number;
}

const statusColors: Record<string, string> = {
  active: "bg-green-500/10 text-green-600 dark:text-green-400",
  completed: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  on_hold: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  cancelled: "bg-red-500/10 text-red-600 dark:text-red-400",
};

const statusLabels: Record<string, string> = {
  active: "Active",
  completed: "Completed",
  on_hold: "On Hold",
  cancelled: "Cancelled",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function BudgetBar({ costToDate, budget }: { costToDate: number; budget: number | null }) {
  if (!budget || budget <= 0) return null;
  const percent = Math.min((costToDate / budget) * 100, 100);
  const overBudget = costToDate > budget;
  const barColor = overBudget ? "bg-destructive" : percent > 80 ? "bg-orange-500" : "bg-green-500";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{formatCurrency(costToDate)} / {formatCurrency(budget)}</span>
        {overBudget ? (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0" data-testid="badge-over-budget">
            Over by {formatCurrency(costToDate - budget)}
          </Badge>
        ) : (
          <span>{Math.round(percent)}%</span>
        )}
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden" data-testid="bar-budget">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  spend,
  onEdit,
  onDelete,
}: {
  project: Project;
  spend?: ProjectSpend;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="hover-elevate" data-testid={`card-project-${project.id}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
            <FolderKanban className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">{project.name}</CardTitle>
            <CardDescription className="font-mono text-xs">{project.code}</CardDescription>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid={`button-project-menu-${project.id}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/projects/${project.id}`} className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4" />
                View Details
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit} className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={statusColors[project.status]}>
            {statusLabels[project.status]}
          </Badge>
          {spend && spend.activeRentals > 0 && (
            <Badge variant="secondary" className="text-xs" data-testid={`badge-rentals-${project.id}`}>
              <Wrench className="h-3 w-3 mr-1" />
              {spend.activeRentals} active
            </Badge>
          )}
        </div>
        {project.address && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{project.address}</span>
          </div>
        )}
        {(project.startDate || project.endDate) && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            <span>
              {project.startDate ? new Date(project.startDate).toLocaleDateString() : "N/A"}
              {" - "}
              {project.endDate ? new Date(project.endDate).toLocaleDateString() : "Ongoing"}
            </span>
          </div>
        )}

        {spend && (spend.costToDate > 0 || (spend.budget && spend.budget > 0)) && (
          <div className="space-y-2 pt-1 border-t">
            <div className="flex items-center gap-2 text-sm pt-2">
              <DollarSign className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="font-medium">{formatCurrency(spend.costToDate)}</span>
              <span className="text-muted-foreground text-xs">cost to date</span>
            </div>
            {spend.totalSpend > 0 && (
              <div className="text-xs text-muted-foreground pl-5.5">
                {formatCurrency(spend.totalSpend)}/mo active
              </div>
            )}
            <BudgetBar costToDate={spend.costToDate} budget={spend.budget} />
          </div>
        )}

        <div className="pt-2">
          <Link href={`/projects/${project.id}`}>
            <Button variant="outline" size="sm" className="w-full" data-testid={`button-view-project-${project.id}`}>
              View Project
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectListRow({
  project,
  spend,
  onEdit,
  onDelete,
}: {
  project: Project;
  spend?: ProjectSpend;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <TableRow data-testid={`row-project-${project.id}`}>
      <TableCell>
        <Link href={`/projects/${project.id}`} className="hover:underline">
          <div className="font-medium">{project.name}</div>
          <div className="text-xs text-muted-foreground font-mono">{project.code}</div>
        </Link>
      </TableCell>
      <TableCell>
        <Badge className={statusColors[project.status]}>
          {statusLabels[project.status]}
        </Badge>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        {project.address ? (
          <span className="text-sm text-muted-foreground truncate max-w-[200px] block">{project.address}</span>
        ) : (
          <span className="text-sm text-muted-foreground">--</span>
        )}
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <span className="text-sm text-muted-foreground">
          {spend ? `${spend.activeRentals} active / ${spend.totalRentals} total` : "--"}
        </span>
      </TableCell>
      <TableCell>
        <div className="text-sm font-medium">
          {spend ? formatCurrency(spend.costToDate) : "$0"}
        </div>
        {spend && spend.totalSpend > 0 && (
          <div className="text-xs text-muted-foreground">{formatCurrency(spend.totalSpend)}/mo</div>
        )}
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        {spend?.budget ? (
          <div className="w-32">
            <BudgetBar costToDate={spend.costToDate} budget={spend.budget} />
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">No budget</span>
        )}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid={`button-project-menu-${project.id}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/projects/${project.id}`} className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4" />
                View Details
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit} className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

export default function Projects() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const { toast } = useToast();

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: spendData } = useQuery<ProjectSpend[]>({
    queryKey: ["/api/dashboard/spend-by-project"],
  });

  const spendMap = new Map<string, ProjectSpend>();
  spendData?.forEach((s) => spendMap.set(s.projectId, s));

  const form = useForm<ProjectFormData>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: "",
      code: "",
      status: "active",
      address: "",
      startDate: "",
      endDate: "",
      budget: "",
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: ProjectFormData) => {
      const res = await apiRequest("POST", "/api/projects", data);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/spend-by-project"] });
      setDialogOpen(false);
      form.reset();
      toast({ title: "Project created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Failed to create project", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ProjectFormData) => {
      const res = await apiRequest("PATCH", `/api/projects/${editingProject?.id}`, data);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/spend-by-project"] });
      setDialogOpen(false);
      setEditingProject(null);
      form.reset();
      toast({ title: "Project updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Failed to update project", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/spend-by-project"] });
      toast({ title: "Project deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete project", variant: "destructive" });
    },
  });

  const handleEdit = (project: Project) => {
    setEditingProject(project);
    form.reset({
      name: project.name,
      code: project.code,
      status: project.status,
      address: project.address || "",
      startDate: project.startDate || "",
      endDate: project.endDate || "",
      budget: project.budget || "",
      notes: project.notes || "",
    });
    setDialogOpen(true);
  };

  const handleDelete = (project: Project) => {
    if (confirm(`Are you sure you want to delete "${project.name}"?`)) {
      deleteMutation.mutate(project.id);
    }
  };

  const onSubmit = (data: ProjectFormData) => {
    const cleaned = {
      ...data,
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      address: data.address || null,
      budget: data.budget || null,
      notes: data.notes || null,
    };
    if (editingProject) {
      updateMutation.mutate(cleaned as any);
    } else {
      createMutation.mutate(cleaned as any);
    }
  };

  const filteredProjects = projects?.filter((project) => {
    const matchesSearch =
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || project.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">Manage your job sites and projects</p>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setEditingProject(null);
              form.reset();
            }
          }}
        >
          <DialogTrigger asChild>
            <Button data-testid="button-create-project">
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingProject ? "Edit Project" : "Create Project"}</DialogTitle>
              <DialogDescription>
                {editingProject
                  ? "Update the project details below."
                  : "Add a new project or job site to track equipment rentals."}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Highway 101 Extension" {...field} data-testid="input-project-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project Code</FormLabel>
                        <FormControl>
                          <Input placeholder="HWY-101" {...field} data-testid="input-project-code" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-project-status">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="on_hold">On Hold</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="123 Main St, City, State" {...field} data-testid="input-project-address" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-project-start-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-project-end-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="budget"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Equipment Rental Budget (Optional)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" placeholder="e.g. 50000" {...field} data-testid="input-project-budget" />
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
                        <Textarea placeholder="Additional project details..." {...field} data-testid="input-project-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-submit-project"
                  >
                    {createMutation.isPending || updateMutation.isPending
                      ? "Saving..."
                      : editingProject
                      ? "Update Project"
                      : "Create Project"}
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
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-projects"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-filter-status">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="on_hold">On Hold</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1 border rounded-md p-0.5" data-testid="toggle-view-mode">
          <Button
            variant={viewMode === "grid" ? "default" : "ghost"}
            size="icon"
            onClick={() => setViewMode("grid")}
            data-testid="button-view-grid"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "ghost"}
            size="icon"
            onClick={() => setViewMode("list")}
            data-testid="button-view-list"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        viewMode === "grid" ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-10 w-10 rounded-md" />
                  <Skeleton className="h-5 w-32 mt-2" />
                  <Skeleton className="h-4 w-20" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-6 w-16 mb-3" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-9 w-full mt-3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="space-y-2 p-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        )
      ) : filteredProjects && filteredProjects.length > 0 ? (
        viewMode === "grid" ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                spend={spendMap.get(project.id)}
                onEdit={() => handleEdit(project)}
                onDelete={() => handleDelete(project)}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Address</TableHead>
                    <TableHead className="hidden lg:table-cell">Rentals</TableHead>
                    <TableHead>Cost to Date</TableHead>
                    <TableHead className="hidden sm:table-cell">Budget</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProjects.map((project) => (
                    <ProjectListRow
                      key={project.id}
                      project={project}
                      spend={spendMap.get(project.id)}
                      onEdit={() => handleEdit(project)}
                      onDelete={() => handleDelete(project)}
                    />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No projects found</h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery || statusFilter !== "all"
                ? "Try adjusting your search or filter criteria."
                : "Get started by creating your first project."}
            </p>
            {!searchQuery && statusFilter === "all" && (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Project
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
