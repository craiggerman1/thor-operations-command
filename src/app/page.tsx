import Link from "next/link";

export default function LoginPage() {
  return (
    <section className="login-screen" aria-label="Thor Operations Command login">
      <div className="login-brand">
        <img src="/assets/thor-logo-stacked-sidebar.png" alt="Thor Mobile Truck Wash" />
        <span>Operations Command</span>
      </div>

      <form className="login-card">
        <div>
          <span className="eyebrow">Secure access prototype</span>
          <h1>Thor Operations Command</h1>
          <p>Sign in to open Thor Operations Command.</p>
        </div>
        <label>
          <span>Email</span>
          <input type="email" placeholder="user@example.com" autoComplete="email" />
        </label>
        <label>
          <span>Password</span>
          <input type="password" placeholder="Enter password" autoComplete="current-password" />
        </label>
        <div className="login-actions">
          <Link href="/overview">Developer quick sign in</Link>
        </div>
        <small className="login-note">Developer use only while TOC is being built. Full authentication and permissions will be connected later.</small>
      </form>
    </section>
  );
}
