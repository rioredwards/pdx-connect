import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl p-6 md:p-12">
      <h1 className="mb-3 text-2xl font-semibold tracking-tight text-foreground">
        pdx-connect
      </h1>
      <p className="mb-6 text-base leading-relaxed text-muted-foreground">
        Hyperlocal partner discovery and outreach (hackathon MVP). The live workflow UI lives on a dedicated path so
        previews are easy to share.
      </p>
      <Link
        className={cn(buttonVariants(), "inline-flex")}
        href="/analysis-tester"
      >
        Open analysis tester →
      </Link>
    </main>
  );
}
