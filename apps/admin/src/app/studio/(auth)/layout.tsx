/** Login lives under /studio/logga-in without the dashboard chrome (sidebar). */
export default function StudioAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
