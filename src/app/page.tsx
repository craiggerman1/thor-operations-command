import { LoginPanel } from "@/components/LoginPanel";

export default function LoginPage() {
  return (
    <section className="login-screen" aria-label="Thor Operations Command login">
      <div className="login-brand">
        <img src="/assets/thor-logo-stacked-sidebar.png" alt="Thor Mobile Truck Wash" />
        <span>Operations Command</span>
      </div>

      <LoginPanel />
    </section>
  );
}
