import { AnimatedBg } from "@/core/ui/AnimatedBg";
import { CommandBar } from "@/core/ui/CommandBar";
import { Sidebar } from "@/core/ui/Sidebar";
import { TopBar } from "@/core/ui/TopBar";

export default function ShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen">
      <AnimatedBg />
      <CommandBar />
      <Sidebar />
      <main className="min-w-0 flex-1 p-4 pl-6">
        <div className="mx-auto max-w-7xl">
          <TopBar />
          {children}
        </div>
      </main>
    </div>
  );
}
