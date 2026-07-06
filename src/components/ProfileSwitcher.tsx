import { useState } from "react";
import type { Profile } from "../types";

export default function ProfileSwitcher({
  profiles,
  activeProfileId,
  onSelect,
  onCreate,
}: {
  profiles: Profile[];
  activeProfileId: string;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = profiles.find((p) => p.id === activeProfileId);

  return (
    <div className="profile-switcher">
      <button className="profile-btn" onClick={() => setOpen((v) => !v)}>
        {active?.name ?? "Профиль"}
      </button>
      {open && (
        <div className="profile-dropdown">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              className={`profile-option ${profile.id === activeProfileId ? "is-active" : ""}`}
              onClick={() => {
                onSelect(profile.id);
                setOpen(false);
              }}
            >
              {profile.name}
            </button>
          ))}
          <button
            className="profile-option is-new"
            onClick={() => {
              const name = window.prompt("Название нового профиля");
              if (name) onCreate(name);
              setOpen(false);
            }}
          >
            + Новый профиль
          </button>
        </div>
      )}
    </div>
  );
}
