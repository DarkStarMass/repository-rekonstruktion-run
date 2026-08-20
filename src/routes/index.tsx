import { createFileRoute } from "@tanstack/react-router";
import { RrrApp } from "@/components/rrr/app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <RrrApp />;
}
