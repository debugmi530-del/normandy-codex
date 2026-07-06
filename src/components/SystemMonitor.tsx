import { useEffect, useState } from "react";

export default function SystemMonitor() {
  const [stats, setStats] = useState({ cpu: 0, ram: 0 });

  useEffect(() => {
    return window.codex.system.onStats(setStats);
  }, []);

  return (
    <div className="system-monitor">
      <div className="monitor-item">
        <span className="monitor-label">CPU</span>
        <div className="monitor-track">
          <div className="monitor-fill" style={{ width: `${stats.cpu}%` }} />
        </div>
        <span className="monitor-value">{stats.cpu}%</span>
      </div>
      <div className="monitor-item">
        <span className="monitor-label">RAM</span>
        <div className="monitor-track">
          <div className="monitor-fill" style={{ width: `${stats.ram}%` }} />
        </div>
        <span className="monitor-value">{stats.ram}%</span>
      </div>
    </div>
  );
}
