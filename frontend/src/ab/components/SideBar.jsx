
import React from "react";

const IconEpisodes = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
);
const IconUpload = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 16V4m0 0l4 4m-4-4l-4 4M4 20h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
);
const IconMic = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="9" y="3" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.5"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
);
const IconLayers = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3l9 5-9 5-9-5 9-5z" stroke="currentColor" strokeWidth="1.5"/><path d="M21 12l-9 5-9-5" stroke="currentColor" strokeWidth="1.5"/></svg>
);
const IconCard = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M3 10h18" stroke="currentColor" strokeWidth="1.5"/></svg>
);

export default function SideBar({ collapsed, setCollapsed, onNavigate, active }) {
  const items = [
  { label: "Episodes", icon: <IconEpisodes/>, route: "episode-history" },
  { label: "Record", icon: <IconMic/>, route: "recorder" },
  { label: "Media Uploads", icon: <IconUpload/>, route: "media-library" },
  { label: "My Podcasts", icon: <IconMic/>, route: "podcast-manager" },
  { label: "Templates", icon: <IconLayers/>, route: "my-templates" },
  { label: "Subscription", icon: <IconCard/>, route: "billing" },
  ];
  return (
    <aside className={(collapsed ? "w-16 " : "w-64 ") + "shrink-0 border-r bg-card"}>
      <div className="h-16 flex items-center justify-between px-3 border-b">
        <span className={"text-sm font-medium truncate " + (collapsed ? "sr-only" : "")}>Workspace</span>
        <button
          className="size-8 grid place-items-center rounded-lg hover:bg-muted focus:outline-none focus-visible:ring"
          title={collapsed ? "Expand" : "Collapse"}
          onClick={() => setCollapsed((v) => !v)}
        >
          <span aria-hidden="true">≡</span>
        </button>
      </div>
      <nav className="p-2 space-y-1">
    {items.map((it, i) => (
          <button
            key={i}
            className={
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm " +
              (active === it.route ? "bg-muted font-medium" : "hover:bg-muted")
            }
      onClick={() => { if (onNavigate) onNavigate(it.route); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          >
            <span className="size-5 grid place-items-center rounded">{it.icon}</span>
            <span className={collapsed ? "sr-only" : "truncate"}>{it.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
