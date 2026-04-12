export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-text">
          © {new Date().getFullYear()} StreamVault. All rights reserved.
        </div>
        <div className="footer-text">
          Exclusive premium content
        </div>
      </div>
    </footer>
  );
}
