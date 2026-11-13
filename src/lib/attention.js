// "Perlu Perhatian" — automatic problem list per SO (read-only DB function attention_items()).
import { supabase } from "@/lib/supabase";

export const TEAMS = [
  { value: "admin", label: "Admin Zoho" },
  { value: "benang", label: "Benang" },
  { value: "produksi", label: "Produksi" },
  { value: "keuangan", label: "Keuangan" },
];

// one entry per check; `warnDays` = from this many days the item is shown red
export const CHECKS = {
  draft_in_prod: { team: "admin", title: "SO masih Draft tapi sudah diproduksi", help: "Konfirmasi SO di Zoho (Draft → Open) supaya masuk laporan Zoho.", daysLabel: "hari sejak produksi", warnDays: 14 },
  shipped_no_invoice: { team: "admin", title: "Sudah dikirim, belum ada invoice", help: "Buat invoice di Zoho dan isi Reference dengan nomor SO.", daysLabel: "hari sejak kirim", warnDays: 7 },
  prod_no_yarn: { team: "benang", title: "Produksi berjalan, belum ada catatan benang", help: "Catat kebutuhan / kedatangan / ambil stok benang SO ini di YarnTrack.", daysLabel: "hari sejak produksi", warnDays: 14 },
  past_deadline: { team: "produksi", title: "Lewat deadline, belum dikirim", help: "Cek sisa proses di Timeline SO dan kabari customer.", daysLabel: "hari lewat deadline", warnDays: 1 },
  stalled: { team: "produksi", title: "Mandek: tidak ada serah terima ≥ 7 hari", help: "Belum dikirim dan tidak ada kegiatan di PO Tukang. Cek apa yang tertahan.", daysLabel: "hari tanpa kegiatan", warnDays: 14 },
  done_not_shipped: { team: "produksi", title: "Selesai di PO Tukang, belum ada catatan kirim", help: "Catat pengirimannya di aplikasi Dispatch (atau cek kenapa belum dikirim).", daysLabel: "hari sejak serah terima terakhir", warnDays: 14 },
  shipped_unpaid: { team: "keuangan", title: "Sudah dikirim, invoice belum lunas", help: "Tagih pelunasan ke customer.", daysLabel: "hari sejak kirim", warnDays: 14 },
};

export async function fetchAttention() {
  const { data, error } = await supabase.rpc("attention_items");
  if (error) throw error;
  return data ?? [];
}
