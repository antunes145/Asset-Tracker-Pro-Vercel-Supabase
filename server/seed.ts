import { storage } from "./storage";

export async function seedDatabase() {
  try {
    // Check if data already exists
    const existingProjects = await storage.getProjects();
    if (existingProjects.length > 0) {
      console.log("Database already seeded, skipping...");
      return;
    }

    console.log("Seeding database with demo data...");

    // Create equipment catalog
    const equipment = [
      { name: "CAT 320 Excavator", type: "Excavator", baseMonthlyCost: "8500", vendor: "United Rentals", notes: "20-ton hydraulic excavator" },
      { name: "John Deere 850K Bulldozer", type: "Bulldozer", baseMonthlyCost: "12000", vendor: "Sunbelt Rentals", notes: "Large crawler dozer" },
      { name: "Liebherr LTM 1100 Crane", type: "Crane", baseMonthlyCost: "25000", vendor: "Maxim Crane Works", notes: "100-ton mobile crane" },
      { name: "CAT 966M Wheel Loader", type: "Loader", baseMonthlyCost: "7500", vendor: "United Rentals", notes: "Large wheel loader" },
      { name: "Toyota 8FGU25 Forklift", type: "Forklift", baseMonthlyCost: "1200", vendor: "Herc Rentals", notes: "5000 lb capacity" },
      { name: "Caterpillar XQ400 Generator", type: "Generator", baseMonthlyCost: "4500", vendor: "Aggreko", notes: "400kW diesel generator" },
      { name: "Atlas Copco XAS 750", type: "Compressor", baseMonthlyCost: "2800", vendor: "Sunbelt Rentals", notes: "750 CFM air compressor" },
      { name: "Scaffolding System 100ft", type: "Scaffolding", baseMonthlyCost: "3200", vendor: "Brand Scaffold", notes: "Complete scaffold system" },
      { name: "Godwin CD150M Pump", type: "Pump", baseMonthlyCost: "1800", vendor: "Xylem", notes: "6-inch dewatering pump" },
      { name: "Kenworth T880 Dump Truck", type: "Truck", baseMonthlyCost: "6500", vendor: "Penske", notes: "Tri-axle dump truck" },
    ];

    const createdEquipment: any[] = [];
    for (const eq of equipment) {
      const created = await storage.createEquipment(eq);
      createdEquipment.push(created);
    }

    // Create projects
    const projects = [
      {
        name: "Highway 101 Extension",
        code: "HWY-101",
        status: "active" as const,
        address: "1234 Highway 101, San Jose, CA 95110",
        startDate: "2024-01-15",
        endDate: "2025-06-30",
        notes: "Major highway extension project with 5 new interchanges",
      },
      {
        name: "Downtown Metro Station",
        code: "METRO-DT",
        status: "active" as const,
        address: "500 Main St, San Francisco, CA 94102",
        startDate: "2024-03-01",
        endDate: "2026-12-31",
        notes: "New underground metro station construction",
      },
      {
        name: "Riverside Office Complex",
        code: "ROC-2024",
        status: "active" as const,
        address: "8900 River Rd, Sacramento, CA 95814",
        startDate: "2024-02-01",
        endDate: "2025-03-15",
        notes: "12-story commercial office building",
      },
      {
        name: "Marina Bay Bridge Repair",
        code: "MBB-REP",
        status: "on_hold" as const,
        address: "Marina Bay Bridge, Oakland, CA",
        startDate: "2024-06-01",
        notes: "Structural repair and seismic retrofit",
      },
      {
        name: "Tech Campus Phase 2",
        code: "TCP-2",
        status: "completed" as const,
        address: "1 Innovation Way, Palo Alto, CA 94304",
        startDate: "2023-01-01",
        endDate: "2024-11-30",
        notes: "Second phase of tech campus development",
      },
    ];

    const createdProjects: any[] = [];
    for (const proj of projects) {
      const created = await storage.createProject(proj);
      createdProjects.push(created);
    }

    // Create rentals
    const today = new Date();
    const rentals = [
      // Highway 101 - 4 rentals
      {
        projectId: createdProjects[0].id,
        equipmentId: createdEquipment[0].id,
        equipmentName: createdEquipment[0].name,
        equipmentType: createdEquipment[0].type,
        vendor: createdEquipment[0].vendor,
        rentalStartDate: "2024-01-20",
        contractRenewalDate: new Date(today.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        monthlyCost: "8500",
        status: "active" as const,
        notes: "Primary excavator for earthwork",
      },
      {
        projectId: createdProjects[0].id,
        equipmentId: createdEquipment[1].id,
        equipmentName: createdEquipment[1].name,
        equipmentType: createdEquipment[1].type,
        vendor: createdEquipment[1].vendor,
        rentalStartDate: "2024-02-01",
        contractRenewalDate: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        monthlyCost: "12000",
        status: "active" as const,
      },
      {
        projectId: createdProjects[0].id,
        equipmentId: createdEquipment[5].id,
        equipmentName: createdEquipment[5].name,
        equipmentType: createdEquipment[5].type,
        vendor: createdEquipment[5].vendor,
        rentalStartDate: "2024-01-25",
        monthlyCost: "4500",
        status: "active" as const,
      },
      {
        projectId: createdProjects[0].id,
        equipmentId: createdEquipment[9].id,
        equipmentName: createdEquipment[9].name,
        equipmentType: createdEquipment[9].type,
        vendor: createdEquipment[9].vendor,
        rentalStartDate: "2024-03-01",
        monthlyCost: "6500",
        status: "active" as const,
      },
      // Metro Station - 3 rentals
      {
        projectId: createdProjects[1].id,
        equipmentId: createdEquipment[2].id,
        equipmentName: createdEquipment[2].name,
        equipmentType: createdEquipment[2].type,
        vendor: createdEquipment[2].vendor,
        rentalStartDate: "2024-03-15",
        contractRenewalDate: new Date(today.getTime() + 25 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        monthlyCost: "25000",
        status: "active" as const,
        notes: "Main crane for structural work",
      },
      {
        projectId: createdProjects[1].id,
        equipmentId: createdEquipment[7].id,
        equipmentName: createdEquipment[7].name,
        equipmentType: createdEquipment[7].type,
        vendor: createdEquipment[7].vendor,
        rentalStartDate: "2024-04-01",
        monthlyCost: "3200",
        status: "active" as const,
      },
      {
        projectId: createdProjects[1].id,
        equipmentId: createdEquipment[8].id,
        equipmentName: createdEquipment[8].name,
        equipmentType: createdEquipment[8].type,
        vendor: createdEquipment[8].vendor,
        rentalStartDate: "2024-03-20",
        monthlyCost: "1800",
        status: "active" as const,
        notes: "Dewatering for underground work",
      },
      // Office Complex - 2 rentals
      {
        projectId: createdProjects[2].id,
        equipmentId: createdEquipment[3].id,
        equipmentName: createdEquipment[3].name,
        equipmentType: createdEquipment[3].type,
        vendor: createdEquipment[3].vendor,
        rentalStartDate: "2024-02-15",
        contractRenewalDate: new Date(today.getTime() + 45 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        monthlyCost: "7500",
        status: "active" as const,
      },
      {
        projectId: createdProjects[2].id,
        equipmentId: createdEquipment[4].id,
        equipmentName: createdEquipment[4].name,
        equipmentType: createdEquipment[4].type,
        vendor: createdEquipment[4].vendor,
        rentalStartDate: "2024-02-20",
        monthlyCost: "1200",
        status: "active" as const,
      },
      // Bridge Repair (on hold) - 1 rental
      {
        projectId: createdProjects[3].id,
        equipmentId: createdEquipment[6].id,
        equipmentName: createdEquipment[6].name,
        equipmentType: createdEquipment[6].type,
        vendor: createdEquipment[6].vendor,
        rentalStartDate: "2024-06-01",
        returnDate: "2024-07-15",
        monthlyCost: "2800",
        status: "returned" as const,
        notes: "Returned - project on hold",
      },
      // Completed project - 1 rental (returned)
      {
        projectId: createdProjects[4].id,
        equipmentId: createdEquipment[0].id,
        equipmentName: createdEquipment[0].name,
        equipmentType: createdEquipment[0].type,
        vendor: createdEquipment[0].vendor,
        rentalStartDate: "2023-02-01",
        returnDate: "2024-10-30",
        monthlyCost: "8000",
        status: "returned" as const,
        notes: "Project completed",
      },
    ];

    for (const rental of rentals) {
      await storage.createRental(rental);
    }

    // Create default settings
    await storage.upsertSetting("prorate_enabled", "false");
    await storage.upsertSetting("renewal_alert_7_days", "true");
    await storage.upsertSetting("renewal_alert_14_days", "true");
    await storage.upsertSetting("renewal_alert_30_days", "true");

    // Create initial activity log
    await storage.createActivityLog({
      action: "system",
      entityType: "system",
      details: "Database initialized with demo data",
    });

    console.log("Database seeded successfully!");
    console.log(`- ${createdEquipment.length} equipment items`);
    console.log(`- ${createdProjects.length} projects`);
    console.log(`- ${rentals.length} rentals`);
  } catch (error) {
    console.error("Error seeding database:", error);
  }
}
