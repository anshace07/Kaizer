// A template re-mounts on every navigation, so each page fades in smoothly (Report -> Confirm -> Incident).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-in fade-in slide-in-from-bottom-1 duration-300">{children}</div>;
}
