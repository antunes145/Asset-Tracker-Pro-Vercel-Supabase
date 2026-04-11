import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Settings as SettingsIcon,
  DollarSign,
  Clock,
  Bell,
  Shield,
  Plus,
  Pencil,
  Trash2,
  Database,
  Truck,
  Users,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/App";
import type { Setting, EquipmentType, User } from "@shared/schema";

const equipmentTypeFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  weeklyCost: z.string().min(1, "Weekly cost is required"),
  fourWeekCost: z.string().min(1, "4-week cost is required"),
  pickupCost: z.string().optional(),
  dropoffCost: z.string().optional(),
  taxPercent: z.string().optional(),
});

type EquipmentTypeFormData = z.infer<typeof equipmentTypeFormSchema>;

const createUserFormSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  fullName: z.string().min(1, "Full name is required"),
  email: z.string().email("Invalid email").or(z.literal("")).optional(),
  role: z.enum(["admin", "manager", "viewer"]),
});

const editUserFormSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters").or(z.literal("")).optional(),
  fullName: z.string().min(1, "Full name is required"),
  email: z.string().email("Invalid email").or(z.literal("")).optional(),
  role: z.enum(["admin", "manager", "viewer"]),
});

type UserFormData = z.infer<typeof createUserFormSchema>;

function formatCurrency(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined) return "$0";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
}

export default function Settings() {
  const [prorateEnabled, setProrateEnabled] = useState(false);
  const [renewalAlert7, setRenewalAlert7] = useState(true);
  const [renewalAlert14, setRenewalAlert14] = useState(true);
  const [renewalAlert30, setRenewalAlert30] = useState(true);
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<EquipmentType | null>(null);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const { toast } = useToast();
  const { isAdmin, user: currentUser } = useAuth();

  const { data: settings, isLoading } = useQuery<Setting[]>({
    queryKey: ["/api/settings"],
  });

  const { data: equipmentTypes, isLoading: typesLoading } = useQuery<EquipmentType[]>({
    queryKey: ["/api/equipment-types"],
  });

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: isAdmin,
  });

  const userForm = useForm<UserFormData>({
    resolver: zodResolver(editingUser ? editUserFormSchema : createUserFormSchema),
    defaultValues: {
      username: "",
      password: "",
      fullName: "",
      email: "",
      role: "viewer",
    },
  });

  const createUserMutation = useMutation({
    mutationFn: (data: UserFormData) =>
      apiRequest("POST", "/api/users", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setUserDialogOpen(false);
      userForm.reset();
      toast({ title: "User created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Failed to create user", variant: "destructive" });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: (data: UserFormData) =>
      apiRequest("PATCH", `/api/users/${editingUser?.id}`, {
        ...data,
        password: data.password || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setUserDialogOpen(false);
      setEditingUser(null);
      userForm.reset();
      toast({ title: "User updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Failed to update user", variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Failed to delete user", variant: "destructive" });
    },
  });

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    userForm.reset({
      username: user.username,
      password: "",
      fullName: user.fullName || "",
      email: user.email || "",
      role: user.role as "admin" | "manager" | "viewer",
    });
    setUserDialogOpen(true);
  };

  const handleDeleteUser = (user: User) => {
    if (user.id === currentUser?.id) {
      toast({ title: "You cannot delete your own account", variant: "destructive" });
      return;
    }
    if (confirm(`Are you sure you want to delete user "${user.username}"?`)) {
      deleteUserMutation.mutate(user.id);
    }
  };

  const onUserSubmit = (data: UserFormData) => {
    if (editingUser) {
      updateUserMutation.mutate(data);
    } else {
      createUserMutation.mutate(data);
    }
  };

  const typeForm = useForm<EquipmentTypeFormData>({
    resolver: zodResolver(equipmentTypeFormSchema),
    defaultValues: {
      name: "",
      weeklyCost: "",
      fourWeekCost: "",
      pickupCost: "0",
      dropoffCost: "0",
      taxPercent: "0",
    },
  });

  useEffect(() => {
    if (settings) {
      const prorateSetting = settings.find((s) => s.key === "prorate_enabled");
      if (prorateSetting) {
        setProrateEnabled(prorateSetting.value === "true");
      }

      const alert7 = settings.find((s) => s.key === "renewal_alert_7_days");
      if (alert7) setRenewalAlert7(alert7.value === "true");

      const alert14 = settings.find((s) => s.key === "renewal_alert_14_days");
      if (alert14) setRenewalAlert14(alert14.value === "true");

      const alert30 = settings.find((s) => s.key === "renewal_alert_30_days");
      if (alert30) setRenewalAlert30(alert30.value === "true");
    }
  }, [settings]);

  const updateSettingMutation = useMutation({
    mutationFn: (data: { key: string; value: string }) =>
      apiRequest("POST", "/api/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Setting updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update setting", variant: "destructive" });
    },
  });

  const createTypeMutation = useMutation({
    mutationFn: (data: EquipmentTypeFormData) =>
      apiRequest("POST", "/api/equipment-types", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment-types"] });
      setTypeDialogOpen(false);
      typeForm.reset();
      toast({ title: "Equipment type added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add equipment type", variant: "destructive" });
    },
  });

  const updateTypeMutation = useMutation({
    mutationFn: (data: EquipmentTypeFormData) =>
      apiRequest("PATCH", `/api/equipment-types/${editingType?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment-types"] });
      setTypeDialogOpen(false);
      setEditingType(null);
      typeForm.reset();
      toast({ title: "Equipment type updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update equipment type", variant: "destructive" });
    },
  });

  const deleteTypeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/equipment-types/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment-types"] });
      toast({ title: "Equipment type deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete equipment type", variant: "destructive" });
    },
  });

  const handleProrateToggle = (checked: boolean) => {
    setProrateEnabled(checked);
    updateSettingMutation.mutate({
      key: "prorate_enabled",
      value: checked.toString(),
    });
  };

  const handleRenewalAlert7 = (checked: boolean) => {
    setRenewalAlert7(checked);
    updateSettingMutation.mutate({
      key: "renewal_alert_7_days",
      value: checked.toString(),
    });
  };

  const handleRenewalAlert14 = (checked: boolean) => {
    setRenewalAlert14(checked);
    updateSettingMutation.mutate({
      key: "renewal_alert_14_days",
      value: checked.toString(),
    });
  };

  const handleRenewalAlert30 = (checked: boolean) => {
    setRenewalAlert30(checked);
    updateSettingMutation.mutate({
      key: "renewal_alert_30_days",
      value: checked.toString(),
    });
  };

  const handleEditType = (eqType: EquipmentType) => {
    setEditingType(eqType);
    typeForm.reset({
      name: eqType.name,
      weeklyCost: eqType.weeklyCost,
      fourWeekCost: eqType.fourWeekCost,
      pickupCost: eqType.pickupCost || "0",
      dropoffCost: eqType.dropoffCost || "0",
      taxPercent: eqType.taxPercent || "0",
    });
    setTypeDialogOpen(true);
  };

  const handleDeleteType = (eqType: EquipmentType) => {
    if (confirm(`Are you sure you want to delete "${eqType.name}"?`)) {
      deleteTypeMutation.mutate(eqType.id);
    }
  };

  const onTypeSubmit = (data: EquipmentTypeFormData) => {
    if (editingType) {
      updateTypeMutation.mutate(data);
    } else {
      createTypeMutation.mutate(data);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-5 w-64 mt-2" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Configure your equipment rental tracking preferences</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Equipment Types Database</CardTitle>
                <CardDescription className="mt-1">
                  Manage equipment types with standard costs. These auto-fill when adding equipment.
                </CardDescription>
              </div>
            </div>
            <Dialog
              open={typeDialogOpen}
              onOpenChange={(open) => {
                setTypeDialogOpen(open);
                if (!open) {
                  setEditingType(null);
                  typeForm.reset();
                }
              }}
            >
              <DialogTrigger asChild>
                <Button data-testid="button-add-equipment-type">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Type
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editingType ? "Edit Equipment Type" : "Add Equipment Type"}</DialogTitle>
                  <DialogDescription>
                    {editingType
                      ? "Update the equipment type details and costs."
                      : "Add a new equipment type with standard pricing."}
                  </DialogDescription>
                </DialogHeader>
                <Form {...typeForm}>
                  <form onSubmit={typeForm.handleSubmit(onTypeSubmit)} className="space-y-4">
                    <FormField
                      control={typeForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Equipment Type Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. Excavator, Crane, Bulldozer"
                              {...field}
                              data-testid="input-type-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={typeForm.control}
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
                                data-testid="input-type-weekly-cost"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={typeForm.control}
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
                                data-testid="input-type-four-week-cost"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={typeForm.control}
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
                                data-testid="input-type-pickup-cost"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={typeForm.control}
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
                                data-testid="input-type-dropoff-cost"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={typeForm.control}
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
                              data-testid="input-type-tax-percent"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button
                        type="submit"
                        disabled={createTypeMutation.isPending || updateTypeMutation.isPending}
                        data-testid="button-submit-equipment-type"
                      >
                        {createTypeMutation.isPending || updateTypeMutation.isPending
                          ? "Saving..."
                          : editingType
                          ? "Update Type"
                          : "Add Type"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {typesLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : equipmentTypes && equipmentTypes.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type Name</TableHead>
                  <TableHead>Weekly Cost</TableHead>
                  <TableHead>4-Week Cost</TableHead>
                  <TableHead>Pickup</TableHead>
                  <TableHead>Drop-off</TableHead>
                  <TableHead>Tax %</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {equipmentTypes.map((eqType) => (
                  <TableRow key={eqType.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{eqType.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>{formatCurrency(eqType.weeklyCost)}</TableCell>
                    <TableCell>{formatCurrency(eqType.fourWeekCost)}</TableCell>
                    <TableCell>{formatCurrency(eqType.pickupCost)}</TableCell>
                    <TableCell>{formatCurrency(eqType.dropoffCost)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{eqType.taxPercent || "0"}%</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditType(eqType)}
                          data-testid={`button-edit-type-${eqType.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteType(eqType)}
                          data-testid={`button-delete-type-${eqType.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-8">
              <Database className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground text-center">
                No equipment types added yet. Add types here and they will auto-fill when creating equipment.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle>User Management</CardTitle>
                  <CardDescription className="mt-1">
                    Create, edit, and manage user accounts and permissions
                  </CardDescription>
                </div>
              </div>
              <Dialog
                open={userDialogOpen}
                onOpenChange={(open) => {
                  setUserDialogOpen(open);
                  if (!open) {
                    setEditingUser(null);
                    userForm.reset();
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button data-testid="button-add-user">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add User
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{editingUser ? "Edit User" : "Create New User"}</DialogTitle>
                    <DialogDescription>
                      {editingUser
                        ? "Update user details and permissions. Leave password blank to keep current password."
                        : "Create a new user account with a role assignment."}
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...userForm}>
                    <form onSubmit={userForm.handleSubmit(onUserSubmit)} className="space-y-4">
                      <FormField
                        control={userForm.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Username</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g. jsmith"
                                {...field}
                                disabled={!!editingUser}
                                data-testid="input-user-username"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={userForm.control}
                        name="fullName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Full Name</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g. John Smith"
                                {...field}
                                data-testid="input-user-fullname"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={userForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email (optional)</FormLabel>
                            <FormControl>
                              <Input
                                type="email"
                                placeholder="e.g. john@company.com"
                                {...field}
                                data-testid="input-user-email"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={userForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{editingUser ? "New Password (leave blank to keep current)" : "Password"}</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder={editingUser ? "Leave blank to keep current" : "Minimum 6 characters"}
                                {...field}
                                data-testid="input-user-password"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={userForm.control}
                        name="role"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Role</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-user-role">
                                  <SelectValue placeholder="Select a role" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="admin">Admin - Full access</SelectItem>
                                <SelectItem value="manager">Manager - Edit access</SelectItem>
                                <SelectItem value="viewer">Viewer - Read-only</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <DialogFooter>
                        <Button
                          type="submit"
                          disabled={createUserMutation.isPending || updateUserMutation.isPending}
                          data-testid="button-submit-user"
                        >
                          {createUserMutation.isPending || updateUserMutation.isPending
                            ? "Saving..."
                            : editingUser
                            ? "Update User"
                            : "Create User"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {usersLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : users && users.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Full Name</TableHead>
                    <TableHead className="hidden md:table-cell">Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                      <TableCell className="font-medium">{u.username}</TableCell>
                      <TableCell>{u.fullName || "-"}</TableCell>
                      <TableCell className="hidden md:table-cell">{u.email || "-"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            u.role === "admin"
                              ? "default"
                              : u.role === "manager"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {u.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditUser(u)}
                            data-testid={`button-edit-user-${u.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {u.id !== currentUser?.id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteUser(u)}
                              data-testid={`button-delete-user-${u.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-8">
                <Users className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground text-center">
                  No users found. Create your first user to get started.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              <CardTitle>Cost Calculations</CardTitle>
            </div>
            <CardDescription>
              Configure how rental costs are calculated
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="prorate">Enable Prorating</Label>
                <p className="text-sm text-muted-foreground">
                  Prorate monthly costs for partial months
                </p>
              </div>
              <Switch
                id="prorate"
                checked={prorateEnabled}
                onCheckedChange={handleProrateToggle}
                disabled={updateSettingMutation.isPending}
                data-testid="switch-prorate"
              />
            </div>
            <Separator />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-2">How prorating works:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>When enabled, costs are calculated based on actual rental days</li>
                <li>A rental starting mid-month will be charged proportionally</li>
                <li>When disabled, full monthly rate is applied regardless of start date</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <CardTitle>Renewal Alerts</CardTitle>
            </div>
            <CardDescription>
              Configure when to show renewal reminders
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="alert-7">7 Days Before</Label>
                <p className="text-sm text-muted-foreground">
                  Show urgent alert
                </p>
              </div>
              <Switch
                id="alert-7"
                checked={renewalAlert7}
                onCheckedChange={handleRenewalAlert7}
                disabled={updateSettingMutation.isPending}
                data-testid="switch-alert-7"
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="alert-14">14 Days Before</Label>
                <p className="text-sm text-muted-foreground">
                  Show warning alert
                </p>
              </div>
              <Switch
                id="alert-14"
                checked={renewalAlert14}
                onCheckedChange={handleRenewalAlert14}
                disabled={updateSettingMutation.isPending}
                data-testid="switch-alert-14"
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="alert-30">30 Days Before</Label>
                <p className="text-sm text-muted-foreground">
                  Show early notice
                </p>
              </div>
              <Switch
                id="alert-30"
                checked={renewalAlert30}
                onCheckedChange={handleRenewalAlert30}
                disabled={updateSettingMutation.isPending}
                data-testid="switch-alert-30"
              />
            </div>
          </CardContent>
        </Card>

        {isAdmin ? (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <CardTitle>User Roles</CardTitle>
              </div>
              <CardDescription>
                Admin, Manager, Viewer permissions overview
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 rounded-md bg-muted/50">
                <p className="font-medium text-sm">Admin</p>
                <p className="text-xs text-muted-foreground">
                  Full access to users, settings, projects, rentals, invoices, and reports
                </p>
              </div>
              <div className="p-3 rounded-md bg-muted/50">
                <p className="font-medium text-sm">Manager</p>
                <p className="text-xs text-muted-foreground">
                  Can manage projects, rentals, invoices, and view reports
                </p>
              </div>
              <div className="p-3 rounded-md bg-muted/50">
                <p className="font-medium text-sm">Viewer</p>
                <p className="text-xs text-muted-foreground">
                  Read-only access to all data except user management
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <CardTitle>User Roles</CardTitle>
              </div>
              <CardDescription>
                Understanding role permissions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 rounded-md bg-muted/50">
                <p className="font-medium text-sm">Admin</p>
                <p className="text-xs text-muted-foreground">
                  Full access to users, settings, projects, rentals, invoices, and reports
                </p>
              </div>
              <div className="p-3 rounded-md bg-muted/50">
                <p className="font-medium text-sm">Manager</p>
                <p className="text-xs text-muted-foreground">
                  Can manage projects, rentals, invoices, and view reports
                </p>
              </div>
              <div className="p-3 rounded-md bg-muted/50">
                <p className="font-medium text-sm">Viewer</p>
                <p className="text-xs text-muted-foreground">
                  Read-only access to all data except user management
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <CardTitle>Activity Log</CardTitle>
            </div>
            <CardDescription>
              Track changes made to the system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              All changes to projects, rentals, and invoices are automatically logged
              with timestamps and user information.
            </p>
            <Button variant="outline" asChild>
              <a href="/api/activity-logs" target="_blank">View Activity Log</a>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-primary" />
            <CardTitle>About EquipTrack</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm font-medium">Version</p>
              <p className="text-sm text-muted-foreground">1.0.0</p>
            </div>
            <div>
              <p className="text-sm font-medium">Database</p>
              <p className="text-sm text-muted-foreground">PostgreSQL</p>
            </div>
            <div>
              <p className="text-sm font-medium">Environment</p>
              <p className="text-sm text-muted-foreground">Production</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
