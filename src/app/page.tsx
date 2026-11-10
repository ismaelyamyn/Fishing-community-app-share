import Header from "@/components/Header";
import MapView from "@/components/MapView";

export default function HomePage() {
  return (
    <main className="flex h-screen flex-col">
      <Header />
      <section className="relative min-h-0 flex-1">
        <MapView />
      </section>
    </main>
  );
}
