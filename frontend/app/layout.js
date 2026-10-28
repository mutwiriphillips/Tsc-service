// The typeface is self-hosted: no request leaves for a third-party font service,
// so visitors' IP addresses are not shared with anyone just to draw text.
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './globals.css';

export const metadata = {
  title: { default: 'TSC Teacher Management & Governance', template: '%s · TSC TMGS' },
  description: 'Staffing, compliance and governance records for the Teachers Service Commission.',
  robots: { index: false, follow: false },
};

export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#1e2b2f' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
