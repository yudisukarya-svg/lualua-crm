// Arsip Customer — helpers for compression, upload, signed URLs and page data.
// Cost-saving rules (see the plan doc):
//  - every file is shrunk in the browser BEFORE upload (WebP for images, re-rendered PDF for big scans)
//  - duplicate files (same SHA-256 per customer) are never uploaded twice
//  - lists only load small thumbnails; signed URLs are reused from localStorage so the
//    browser cache keeps working and the same photo is not downloaded again
//  - each screen loads its data with ONE rpc call
import { supabase } from "@/lib/supabase";

export const ARCHIVE_BUCKET = "customer-archive";
export const PROGRAM_BUCKET = "machine-programs";
export const MAX_BYTES = 10 * 1024 * 1024;

export const ENTRY_KINDS = [
  { value: "sample", label: "Sample" },
  { value: "revisi_sample", label: "Revisi sample" },
  { value: "produksi", label: "Produksi" },
  { value: "reorder", label: "Re-order" },
];
export const PHOTO_CATEGORIES = [
  { value: "sample", label: "Sample" },
  { value: "produksi", label: "Produksi" },
  { value: "referensi", label: "Referensi customer" },
  { value: "qc", label: "QC" },
];
export const LABEL_ITEMS = [
  { value: "brand_label", label: "Label merek (brand label)", fields: ["Nama merek", "Jenis (woven/printed/kulit)", "Posisi", "Cara jahit", "Disediakan oleh"], photos: ["Close-up", "Posisi di baju", "Hasil jahitan"] },
  { value: "care_label", label: "Label perawatan (care label)", fields: ["Isi", "Posisi", "Cara jahit"], photos: ["Close-up", "Posisi", "Hasil jahitan"] },
  { value: "size_label", label: "Label ukuran (size label)", fields: ["Format", "Posisi", "Cara jahit"], photos: ["Close-up", "Posisi", "Hasil jahitan"] },
  { value: "hang_tag", label: "Hang tag", fields: ["Isi tag", "Cara pasang", "Posisi"], photos: ["Depan & belakang", "Posisi", "Hasil terpasang"] },
  { value: "folding", label: "Cara lipat & polybag", fields: ["Cara lipat", "Polybag", "Isi per polybag", "Kertas tisu / silica"], photos: ["Langkah lipat", "Hasil lipat", "Dalam polybag"] },
  { value: "carton", label: "Karton & pengiriman", fields: ["Isi per karton", "Label karton", "Catatan"], photos: ["Isi karton", "Label karton"] },
];
export const NOTE_TOPICS = [
  { value: "warna_bahan", label: "Persetujuan warna / bahan" },
  { value: "ukuran", label: "Ukuran" },
  { value: "pembayaran", label: "Pembayaran" },
  { value: "deadline", label: "Deadline" },
  { value: "po", label: "PO & revisi PO" },
  { value: "lainnya", label: "Lainnya" },
];
export const PO_STATUS = [
  { value: "aktif", label: "Aktif" },
  { value: "revisi", label: "Revisi" },
  { value: "selesai", label: "Selesai dikirim" },
];
// Urutan proses seperti di PO Tukang; proses lain yang muncul di PO Tukang ikut ditampilkan di belakang
export const STAGES = ["Rajut", "QC Rajut", "Linking", "QC Linking", "Finishing", "QC Finishing", "Steam", "Labelling", "Jahit",
  "Aksesories", "Aksesories - Plaket", "Aksesories - Tali", "QC Final"];
export function stageList(...costObjs) {
  const found = new Set();
  for (const c of costObjs) for (const k of Object.keys(c || {})) found.add(k);
  return [...STAGES.filter((s) => found.has(s)), ...[...found].filter((s) => !STAGES.includes(s)).sort()];
}

export const labelOf = (list, v) => list.find((x) => x.value === v)?.label ?? v ?? "—";

export function formatBytes(n) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
export function formatRp(n) {
  if (n == null) return "—";
  return "Rp " + Number(n).toLocaleString("id-ID");
}
export function costRange(c) {
  if (!c) return "—";
  return c.min === c.max ? formatRp(c.min) : `${formatRp(c.min)}–${formatRp(c.max)}`;
}
export function costTotal(costs) {
  if (!costs) return null;
  const vals = Object.values(costs).filter(Boolean);
  if (!vals.length) return null;
  return { min: vals.reduce((a, c) => a + Number(c.min), 0), max: vals.reduce((a, c) => a + Number(c.max), 0) };
}
export const isImage = (mime) => /^image\//.test(mime || "");

// ---------- hashing ----------
export async function sha256(blob) {
  const buf = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- image compression ----------
async function decodeImage(file) {
  let src = file;
  const isHeic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
  if (isHeic) {
    const { default: heic2any } = await import("heic2any");
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
    src = Array.isArray(out) ? out[0] : out;
  }
  return await createImageBitmap(src);
}

function drawToWebp(bitmap, { maxW, maxH, quality }) {
  const scale = Math.min(1, maxW / bitmap.width, maxH / bitmap.height);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/webp", quality));
}

// Rules per kind of upload. "sharp" keeps label text / chat text readable.
function imageRule(section) {
  if (section === "whatsapp") return { maxW: 1080, maxH: 6000, quality: 0.82 };          // screenshot: keep width, text sharp
  if (section === "label_packing" || section === "spec_sheet" || section === "customer_po")
    return { maxW: 2000, maxH: 2000, quality: 0.8 };                                     // close-ups & documents
  return { maxW: 1600, maxH: 1600, quality: 0.78 };                                      // normal photos
}

// ---------- PDF compression (only for big scanned PDFs) ----------
async function shrinkPdf(file) {
  if (file.size <= 2 * 1024 * 1024) return file;          // typed PDFs are already small: keep text searchable
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const { jsPDF } = await import("jspdf");
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  let out = null;
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 1400 / base.width);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
    const img = canvas.toDataURL("image/jpeg", 0.7);
    const wPt = base.width, hPt = base.height;
    if (!out) out = new jsPDF({ unit: "pt", format: [wPt, hPt], orientation: wPt > hPt ? "l" : "p", compress: true });
    else out.addPage([wPt, hPt], wPt > hPt ? "l" : "p");
    out.addImage(img, "JPEG", 0, 0, wPt, hPt, undefined, "FAST");
  }
  const blob = out.output("blob");
  return blob.size < file.size ? new File([blob], file.name.replace(/\.pdf$/i, "") + ".pdf", { type: "application/pdf" }) : file;
}

// Returns { main: Blob, thumb: Blob|null, mime, ext, originalSize }
export async function compressFile(file, section) {
  if (/^video\//.test(file.type)) throw new Error("Video belum bisa disimpan di arsip.");
  const isImg = /^image\//.test(file.type) || /\.(heic|heif)$/i.test(file.name);
  if (isImg) {
    const bmp = await decodeImage(file);
    const main = await drawToWebp(bmp, imageRule(section));
    const thumb = await drawToWebp(bmp, { maxW: 320, maxH: 320, quality: 0.7 });
    bmp.close?.();
    return { main, thumb, mime: "image/webp", ext: "webp", originalSize: file.size };
  }
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const main = await shrinkPdf(file);
    return { main, thumb: null, mime: "application/pdf", ext: "pdf", originalSize: file.size };
  }
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  return { main: file, thumb: null, mime: file.type || "application/octet-stream", ext, originalSize: file.size };
}

// ---------- upload ----------
// meta: { customerId, styleId, entryId, labelId, noteId, poId, section, category, mediaDate, caption }
// Returns { status: "uploaded"|"duplicate", row, before, after }
export async function uploadArchiveFile(file, meta, onStep) {
  onStep?.("Mengecek file kembar…");
  const hash = await sha256(file);
  const { data: dup } = await supabase.from("archive_media")
    .select("id").eq("customer_id", meta.customerId).eq("sha256", hash).maybeSingle();
  if (dup) return { status: "duplicate", before: file.size, after: 0 };

  onStep?.("Memperkecil…");
  const c = await compressFile(file, meta.section);
  if (c.main.size > MAX_BYTES) throw new Error(`File masih ${formatBytes(c.main.size)} setelah diperkecil (maks. 10 MB).`);

  const folder = `${meta.customerId}/${meta.styleId || "_"}`;
  const path = `${folder}/${hash.slice(0, 24)}.${c.ext}`;
  const thumbPath = c.thumb ? `${folder}/t_${hash.slice(0, 24)}.webp` : null;

  onStep?.("Mengirim…");
  const st = supabase.storage.from(ARCHIVE_BUCKET);
  const { error: e1 } = await st.upload(path, c.main, { contentType: c.mime, cacheControl: "31536000", upsert: true });
  if (e1) throw e1;
  if (c.thumb) {
    const { error: e2 } = await st.upload(thumbPath, c.thumb, { contentType: "image/webp", cacheControl: "31536000", upsert: true });
    if (e2) throw e2;
  }

  let version = 1;
  if (meta.section === "spec_sheet" && meta.styleId) {
    const { data: top } = await supabase.from("archive_media").select("version")
      .eq("style_id", meta.styleId).eq("section", "spec_sheet").order("version", { ascending: false }).limit(1);
    version = (top?.[0]?.version ?? 0) + 1;
  }
  const baseName = file.name.replace(/\.(heic|heif|jpe?g|png|gif|bmp|webp)$/i, "");
  const row = {
    customer_id: meta.customerId,
    style_id: meta.styleId ?? null,
    entry_id: meta.entryId ?? null,
    label_id: meta.labelId ?? null,
    note_id: meta.noteId ?? null,
    po_id: meta.poId ?? null,
    section: meta.section,
    category: meta.category ?? null,
    media_date: meta.mediaDate,
    file_name: c.mime === "image/webp" ? `${baseName}.webp` : file.name,
    storage_path: path,
    thumb_path: thumbPath,
    mime_type: c.mime,
    size_bytes: c.main.size,
    original_size_bytes: c.originalSize,
    sha256: hash,
    version,
    caption: meta.caption ?? null,
  };
  const { data, error } = await supabase.from("archive_media").insert(row).select().single();
  if (error) throw error;
  return { status: "uploaded", row: data, before: c.originalSize, after: c.main.size + (c.thumb?.size ?? 0) };
}

// ---------- signed URLs (cached so the browser cache keeps working) ----------
const URL_TTL = 7 * 24 * 3600;           // 7 days
const CACHE_KEY = "archiveSignedUrls.v1";
let memCache = null;
function readCache() {
  if (memCache) return memCache;
  try { memCache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch { memCache = {}; }
  return memCache;
}
function writeCache() {
  try {
    const now = Date.now();
    for (const k of Object.keys(memCache)) if (memCache[k].exp < now) delete memCache[k];
    localStorage.setItem(CACHE_KEY, JSON.stringify(memCache));
  } catch { /* storage full or blocked: memory cache still works */ }
}
const pending = new Map();

// One request for any number of paths; reuses URLs that are still valid for > 1 day.
export async function getSignedUrls(paths, bucket = ARCHIVE_BUCKET) {
  const cache = readCache();
  const now = Date.now();
  const result = {};
  const missing = [];
  for (const p of [...new Set(paths.filter(Boolean))]) {
    const key = `${bucket}:${p}`;
    const hit = cache[key];
    if (hit && hit.exp - now > 24 * 3600 * 1000) result[p] = hit.u;
    else missing.push(p);
  }
  if (missing.length) {
    const reqKey = bucket + "|" + missing.sort().join("|");
    let prom = pending.get(reqKey);
    if (!prom) {
      prom = supabase.storage.from(bucket).createSignedUrls(missing, URL_TTL);
      pending.set(reqKey, prom);
    }
    const { data } = await prom;
    pending.delete(reqKey);
    for (const d of data ?? []) {
      if (d.signedUrl && d.path) {
        cache[`${bucket}:${d.path}`] = { u: d.signedUrl, exp: now + URL_TTL * 1000 };
        result[d.path] = d.signedUrl;
      }
    }
    writeCache();
  }
  return result;
}

export function programUrl(path) {
  return supabase.storage.from(PROGRAM_BUCKET).getPublicUrl(path).data.publicUrl;
}

// ---------- page data (1 request per screen) ----------
async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}
export const fetchCustomerList = () => rpc("archive_customer_list");
export const fetchCustomerPage = (id) => rpc("archive_customer_page", { p_customer: id });
export const fetchStylePage = (id) => rpc("archive_style_page", { p_style: id });
export const searchArchive = (q) => rpc("archive_search", { p_q: q });

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function fmtDate(v) {
  if (!v) return "—";
  const [y, m, d] = String(v).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}
export const markCustomerRead = (id) => rpc("archive_mark_read", { p_customer: id });

// ---------- delete (entri riwayat, catatan/percakapan, PO customer) ----------
// Deletes the record AND its photos/files (archive_media rows + storage objects).
// Works whatever the archive_media foreign key does (cascade / set null / restrict).
// Throws a clear message if the database silently refused (RLS = 0 rows deleted).
const DELETE_TARGETS = {
  style_entries: "entry_id",
  customer_notes: "note_id",
  customer_pos: "po_id",
};
export async function deleteArchiveRecord(table, id) {
  if (table === "archive_media") return deleteArchiveMedia(id);
  const fk = DELETE_TARGETS[table];
  if (!fk) throw new Error(`Tabel ${table} tidak bisa dihapus dari sini.`);

  // 1. remember which files belong to this record
  const { data: media, error: e0 } = await supabase.from("archive_media")
    .select("id, storage_path, thumb_path").eq(fk, id);
  if (e0) throw e0;
  const mediaIds = (media ?? []).map((m) => m.id);

  // 2. delete the record itself (if a foreign key blocks it, remove the files' rows first)
  const del = () => supabase.from(table).delete().eq("id", id).select("id");
  let { data: gone, error } = await del();
  if (error?.code === "23503" && mediaIds.length) {
    const { error: em } = await supabase.from("archive_media").delete().in("id", mediaIds);
    if (em) throw em;
    ({ data: gone, error } = await del());
  }
  if (error) throw error;
  if (!gone?.length) throw new Error("Tidak terhapus — akun ini belum punya izin hapus di database. Kabari admin.");

  // 3. remove leftover file rows + the files in storage (frees space)
  if (mediaIds.length) {
    await supabase.from("archive_media").delete().in("id", mediaIds);
    const paths = media.flatMap((m) => [m.storage_path, m.thumb_path]).filter(Boolean);
    if (paths.length) {
      const { error: es } = await supabase.storage.from(ARCHIVE_BUCKET).remove(paths);
      if (es) console.warn("[archive] file storage tidak terhapus:", es.message);
    }
  }
  return { files: mediaIds.length };
}

// Delete ONE file (spec sheet version, file lain, …): its row + the file in storage.
export async function deleteArchiveMedia(id) {
  const { data: gone, error } = await supabase.from("archive_media").delete().eq("id", id)
    .select("storage_path, thumb_path");
  if (error) throw error;
  if (!gone?.length) throw new Error("Tidak terhapus — akun ini belum punya izin hapus di database. Kabari admin.");
  const paths = gone.flatMap((m) => [m.storage_path, m.thumb_path]).filter(Boolean);
  if (paths.length) {
    const { error: es } = await supabase.storage.from(ARCHIVE_BUCKET).remove(paths);
    if (es) console.warn("[archive] file storage tidak terhapus:", es.message);
  }
  return { files: 1 };
}
