import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

const BUCKET = "crm-files";

export function useFiles({ projectId, customerId, folder } = {}) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("project_files")
      .select("*, uploaded_by_user:users!project_files_uploaded_by_fkey(full_name)")
      .order("created_at", { ascending: false });
    if (projectId) q = q.eq("project_id", projectId);
    if (customerId) q = q.eq("customer_id", customerId);
    if (folder) q = q.eq("folder", folder);
    const { data } = await q;
    setFiles(data ?? []);
    setLoading(false);
  }, [projectId, customerId, folder]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);
  return { files, loading, refetch: fetchFiles };
}

// Upload a File object to storage and record it in project_files.
export async function uploadFile(file, { projectId, customerId, folder = "design_files", versionGroup } = {}) {
  const { data: { user } } = await supabase.auth.getUser();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${projectId || customerId || "shared"}/${folder}/${Date.now()}-${safeName}`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (upErr) throw upErr;

  // Determine version number if extending an existing version group
  let version = 1;
  let group = versionGroup;
  if (versionGroup) {
    const { data: prev } = await supabase
      .from("project_files").select("version").eq("version_group", versionGroup)
      .order("version", { ascending: false }).limit(1);
    version = (prev?.[0]?.version ?? 0) + 1;
  }

  const insert = {
    project_id: projectId ?? null,
    customer_id: customerId ?? null,
    folder,
    file_name: file.name,
    storage_path: path,
    mime_type: file.type,
    size_bytes: file.size,
    version,
    uploaded_by: user?.id,
    is_current: true,
  };
  if (group) insert.version_group = group;

  const { data, error } = await supabase.from("project_files").insert(insert).select().single();
  if (error) throw error;
  return data;
}

// Create a short-lived signed URL for preview/download.
export async function getSignedUrl(storagePath, expiresIn = 3600) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteFile(file) {
  await supabase.storage.from(BUCKET).remove([file.storage_path]);
  const { error } = await supabase.from("project_files").delete().eq("id", file.id);
  if (error) throw error;
}

export async function getFileVersions(versionGroup) {
  const { data } = await supabase
    .from("project_files")
    .select("*, uploaded_by_user:users!project_files_uploaded_by_fkey(full_name)")
    .eq("version_group", versionGroup)
    .order("version", { ascending: false });
  return data ?? [];
}
