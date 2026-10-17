import Link from "next/link";
import { LogoMark } from "./logo";
import "../_styles/404.css";

const EMAIL = "hello@example.com";

export function NotFoundPage() {
  return (
    <div className="pn">
      <div className="wrap">
        <header className="nav">
          <Link className="brand" href="/" aria-label="Splits home">
            <LogoMark size={30} />
            <span>Splits</span>
          </Link>
          <nav className="links" aria-label="Main">
            <Link href="/">Home</Link>
            <a href={`mailto:${EMAIL}`}>Contact</a>
          </nav>
        </header>

        <main className="main">
          <div className="numwrap" aria-hidden="true">
            <div className="num"><span className="n a">404</span><span className="n b">404</span></div>
          </div>
          <div>
            <h1>We can’t find that page.</h1>
            <p className="lead">The link may be old or mistyped. Head back home or try one of these.</p>
            <div className="cta">
              <Link className="btn" href="/">Back to home</Link>
              <a className="textlink" href={`mailto:${EMAIL}`}>Contact us</a>
            </div>
            <ul className="rows">
              <li><Link href="/#how">How it works<span>Home</span></Link></li>
              <li><Link href="/#pay">Apple Pay and cards<span>Home</span></Link></li>
              <li><Link href="/#faq">Questions, answered<span>Home</span></Link></li>
            </ul>
          </div>
        </main>

        <footer>
          <div className="brand" style={{ fontSize: 22 }}>
            <LogoMark size={26} />
            <span>Splits</span>
          </div>
          <nav className="links" aria-label="Footer">
            <Link href="/">Home</Link>
            <a href={`mailto:${EMAIL}`}>Contact</a>
            <Link href="/">Privacy</Link>
            <Link href="/">Terms</Link>
          </nav>
        </footer>
        <div className="fine">Payments are simulated in this demo. Apple Pay is a trademark of Apple Inc.</div>
      </div>
    </div>
  );
}
