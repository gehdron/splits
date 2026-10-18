import { LogoMark } from "./logo";
import "../_styles/loading.css";

export function LoadingScreen({ message }: { message: string }) {
  return (
    <main className="loading-screen" aria-live="polite" aria-busy="true">
      <div className="loading-mark">
        <LogoMark size={56} />
      </div>
      <p className="loading-brand">Splits</p>
      <p className="loading-message">{message}</p>
    </main>
  );
}
