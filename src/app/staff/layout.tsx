import { richiediStaff } from "@/lib/staff";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  await richiediStaff();
  return (
    <div className="staff-shell">
      <header className="staff-testata">
        <div className="brand-staff">
          Match<b>AmI</b> <span>· Staff</span>
        </div>
      </header>
      <main className="staff-contenuto">{children}</main>
    </div>
  );
}
