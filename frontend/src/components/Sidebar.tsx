import { BarChart3, Settings } from "lucide-react";

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

const items = [
  { label: "Analytics", icon: BarChart3 },
];

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-items">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.label} className={activeView === item.label ? "side-active" : ""} onClick={() => onViewChange(item.label)}>
              <Icon size={22} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      <button className="settings-button" aria-label="Settings">
        <Settings size={22} />
      </button>
    </aside>
  );
}
