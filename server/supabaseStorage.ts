import { randomUUID } from "crypto";
import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const bucketName = process.env.SUPABASE_STORAGE_BUCKET || "invoices";

let supabaseAdmin: SupabaseClient | null = null;
let bucketReady: Promise<void> | null = null;

function getSupabaseAdmin() {
  if (supabaseAdmin) {
    return supabaseAdmin;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for invoice file storage",
    );
  }

  supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseAdmin;
}

async function ensureBucket() {
  if (!bucketReady) {
    bucketReady = (async () => {
      const client = getSupabaseAdmin();
      const { error } = await client.storage.getBucket(bucketName);

      if (!error) {
        return;
      }

      const { error: createError } = await client.storage.createBucket(bucketName, {
        public: false,
      });

      if (createError && !createError.message.toLowerCase().includes("already exists")) {
        throw createError;
      }
    })();
  }

  return bucketReady;
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function uploadInvoiceFile(file: Express.Multer.File) {
  await ensureBucket();

  const extension = path.extname(file.originalname);
  const safeName = sanitizeFilename(path.basename(file.originalname, extension));
  const storagePath = `invoices/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeName}${extension}`;

  const { error } = await getSupabaseAdmin()
    .storage
    .from(bucketName)
    .upload(storagePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (error) {
    throw error;
  }

  return storagePath;
}

export async function downloadInvoiceFile(storagePath: string) {
  const { data, error } = await getSupabaseAdmin()
    .storage
    .from(bucketName)
    .download(storagePath);

  if (error) {
    return null;
  }

  return Buffer.from(await data.arrayBuffer());
}

export async function deleteInvoiceFile(storagePath: string) {
  const { error } = await getSupabaseAdmin()
    .storage
    .from(bucketName)
    .remove([storagePath]);

  if (error) {
    console.error("Failed to delete invoice file from Supabase Storage:", error);
  }
}
