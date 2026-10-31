import type { Metadata } from "next";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { SITE_TITLE } from "@/lib/site";
import "@/assets/css/admin.css";

export const metadata: Metadata = {
  title: `Administration · ${SITE_TITLE}`,
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminPanel />;
}
